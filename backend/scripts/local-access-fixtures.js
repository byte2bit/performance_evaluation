const http = require('node:http')
const express = require('express')
const knexFactory = require('knex')
const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')
const { AsyncLocalStorage } = require('node:async_hooks')
const { RateLimiterMySQL } = require('rate-limiter-flexible')
const { ConnectSessionKnexStore } = require('connect-session-knex')
const { TARGET } = require('./local-mysql-copy')
const { fixtures, names, ensure, guardConnection, accountFacade } = require('./local-access-guard')
const { createAuth } = require('../lib/auth')
const { createCredentials } = require('../lib/auth/credentials')
const { createPasswords } = require('../lib/auth/passwords')
const { createLegacyBcrypt } = require('../lib/auth/legacy-bcrypt')
const { createLimits } = require('../lib/auth/limits')
const { readConfig } = require('../lib/auth/config')
const fixture = require('../test/helpers/legacy-bcrypt-fixture').ascii

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, timeout = 6000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) { if (await check()) return; await sleep(25) }
    throw Object.assign(new Error('Fixture condition not observed'), { code: 'E2B_FIXTURE_TIMEOUT' })
}

function sqlStore(db) {
    const store = new ConnectSessionKnexStore({ knex: db, tableName: fixtures.sessions, createTable: false, cleanupInterval: 0 })
    for (const name of ['get', 'set', 'touch', 'destroy']) {
        const method = store[name].bind(store)
        store[name] = (...args) => {
            const callback = args.at(-1); let completed = false
            const done = (...values) => { if (!completed) { completed = true; if (typeof callback === 'function') callback(...values) } }
            if (typeof callback === 'function') args[args.length - 1] = done
            else args.push(done)
            try { Promise.resolve(method(...args)).catch(done) } catch (error) { done(error) }
        }
    }
    store.ready.catch(() => {})
    return store
}

async function validateFixtures({ config, profile, control, permitted, assertControl, progress = () => {} }) {
    ensure(config.host === '127.0.0.1' && config.port === 3306 && profile.target === TARGET, 'E2B_FIXTURE_TARGET_REFUSED')
    const audit = [], scope = new AsyncLocalStorage(), gates = { prepared: deferred(), commit: deferred(), hashing: deferred(), hash: deferred() }
    const inFlight = []
    const track = promise => { promise.catch(() => {}); inFlight.push(promise); return promise }
    let failCommit = true, holdCommit = true, holdHash = true, server, blocking = false
    const legacy = createLegacyBcrypt(), realPasswords = createPasswords()
    const db = knexFactory({ client: 'mysql', connection: { ...config, database: TARGET, charset: 'utf8mb4', multipleStatements: false },
        log: { warn() {}, error() {}, debug() {}, deprecate() {} }, acquireConnectionTimeout: 10000,
        pool: { min: 0, max: 6, afterCreate(connection, done) {
            connection.query('SELECT DATABASE() AS name,@@port AS port,@@server_uuid AS uuid', (error, rows) => {
                if (error || rows?.[0]?.name !== TARGET || Number(rows[0].port) !== 3306 || rows[0].uuid !== profile.serverUuid) {
                    return done(new Error('Fixture connection refused'), connection)
                }
                connection.query('SET SESSION innodb_lock_wait_timeout=8', setError => {
                    if (setError) return done(new Error('Fixture connection refused'), connection)
                    permitted.add(Number(connection.threadId))
                    guardConnection(connection, audit)
                    done(null, connection)
                })
            })
        } } })
    try {
        const modernHash = await realPasswords.hash(fixture.password)
        const seed = [
            [1, 'modern', modernHash, 1, null], [2, 'legacy', fixture.stored, 1, null],
            [3, 'inactive', fixture.stored, 0, null], [4, 'deleted', fixture.stored, 1, '2026-01-01 00:00:00'],
            [5, 'commit-failure', fixture.stored, 1, null], [6, 'parallel', fixture.stored, 1, null],
            [7, 'held-commit', fixture.stored, 1, null], [8, 'old-session', modernHash, 1, null],
            [9, 'changed-state', fixture.stored, 1, null]
        ].map(([id, label, password, active, deletedAt]) => ({ id, name: 'Synthetic fixture', email: label + '@example.invalid',
            password, active, admin: 0, deletedAt, session_version: 0 }))
        await db(fixtures.users2).insert(seed)
        const accountDb = accountFacade(db, async identity => {
            if (identity?.id === 5 && failCommit) { failCommit = false; throw new Error('Injected pre-commit failure') }
            if (identity?.id === 7 && holdCommit) { holdCommit = false; gates.prepared.resolve(); await gates.commit.promise }
            return identity
        })
        const passwords = { ...realPasswords, async hash(value) {
            if (scope.getStore()?.body?.email === 'changed-state@example.invalid' && holdHash) {
                holdHash = false; gates.hashing.resolve(); await gates.hash.promise
            }
            return realPasswords.hash(value)
        } }
        const store = sqlStore(db); await store.ready
        class FixtureLimiter extends RateLimiterMySQL {
            constructor(options) { super({ ...options, dbName: TARGET, tableName: fixtures.auth_rate_limits }) }
        }
        const authConfig = readConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString('hex') })
        authConfig.cookieName = 'evaluation.e2b.fixture.sid'
        const auth = createAuth({ db: accountDb, config: authConfig, passwords, store,
            credentials: createCredentials({ db: accountDb, passwords, legacy }), limit: createLimits(db, authConfig, FixtureLimiter) })
        const app = express(); app.config = { passport: auth }
        app.use((req, res, next) => scope.run(req, next))
        require('../config/middlewares')(app)
        app.get('/csrf-token', auth.limit('csrf'), auth.handlers.csrfToken)
        app.post('/signin', auth.csrf, auth.limit('signin'), auth.handlers.signin)
        app.get('/session', auth.requireUser, auth.handlers.session)
        app.post('/signout', auth.requireUser, auth.csrf, auth.handlers.signout)
        app.use((req, res) => res.status(404).send('Unavailable'))
        app.use(auth.errorHandler)
        server = http.createServer(app)
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
        const port = server.address().port
        function client() {
            let cookie = ''
            return {
                get cookie() { return cookie },
                async request(method, url, data, headers = {}) {
                    const body = data === undefined ? '' : JSON.stringify(data)
                    return new Promise((resolve, reject) => {
                        const request = http.request({ hostname: '127.0.0.1', port, method, path: url,
                            headers: { Origin: authConfig.origin, 'Content-Type': 'application/json', Cookie: cookie,
                                'Content-Length': Buffer.byteLength(body), ...headers } }, response => {
                            const chunks = []; const nextCookie = response.headers['set-cookie']?.[0]
                            if (nextCookie) cookie = nextCookie.split(';')[0]
                            response.on('data', chunk => chunks.push(chunk))
                            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
                                text: Buffer.concat(chunks).toString(), json() { return JSON.parse(this.text) } }))
                        })
                        request.setTimeout(12000, () => request.destroy(new Error('Fixture HTTP timeout')))
                        request.once('error', reject); request.end(body)
                    })
                },
                async csrf() { return (await this.request('GET', '/csrf-token')).json().csrfToken },
                async login(label, secret = fixture.password) {
                    return this.request('POST', '/signin', { email: label + '@example.invalid', password: secret }, { 'X-CSRF-Token': await this.csrf() })
                }
            }
        }
        const account = async id => db(fixtures.users2).where({ id }).first()
        progress('fixture-http-basics')
        const modern = client(); assert.equal((await modern.login('modern')).status, 200)
        assert.equal((await modern.request('GET', '/session')).status, 200)
        for (const label of ['inactive', 'deleted', 'absent']) {
            const response = await client().login(label); assert.equal(response.status, 401); assert.equal(response.text, 'E-mail ou senha inválidos.')
        }
        assert.equal((await client().login('legacy', 'wrong-synthetic-password')).status, 401)
        const legacyClient = client(), oldToken = await legacyClient.csrf(), oldCookie = legacyClient.cookie
        const successful = await legacyClient.request('POST', '/signin', { email: 'legacy@example.invalid', password: fixture.password }, { 'X-CSRF-Token': oldToken })
        assert.equal(successful.status, 200); assert.notEqual(legacyClient.cookie, oldCookie)
        assert.match(successful.headers['set-cookie'][0], /HttpOnly/); assert.match(successful.headers['set-cookie'][0], /SameSite=Lax/)
        assert.deepEqual(Object.keys(successful.json()).sort(), ['admin', 'email', 'id', 'name'])
        const upgraded = await account(2)
        assert.match(upgraded.password, /^\$argon2id\$/); assert.equal(upgraded.session_version, 1)
        assert.equal(await realPasswords.verify(upgraded.password, fixture.password), true)
        assert.equal((await client().login('legacy')).status, 200)
        assert.equal((await account(2)).password, upgraded.password)
        const newToken = await legacyClient.csrf(); assert.notEqual(newToken, oldToken)
        assert.equal((await legacyClient.request('POST', '/signout', {}, { 'X-CSRF-Token': oldToken })).status, 403)
        assert.equal((await legacyClient.request('POST', '/signout', {}, { 'X-CSRF-Token': newToken, Origin: 'https://untrusted.example.invalid' })).status, 403)
        assert.equal((await legacyClient.request('POST', '/signout', {}, { 'X-CSRF-Token': newToken })).status, 204)
        assert.equal((await legacyClient.request('GET', '/session')).status, 401)
        assert.equal((await client().request('GET', '/registros')).status, 404)
        const older = client(); assert.equal((await older.login('old-session')).status, 200)
        await db(fixtures.users2).where({ id: 8 }).update({ password: fixture.stored })
        assert.equal((await client().login('old-session')).status, 200)
        assert.equal((await older.request('GET', '/session')).status, 401)
        for (let i = 0; i < 5; i++) assert.equal((await client().login('rate', 'wrong-synthetic-password')).status, 401)
        assert.equal((await client().login('rate', 'wrong-synthetic-password')).status, 429)
        progress('fixture-rollback-and-commit-order')
        const failed = client(), response = await failed.login('commit-failure')
        assert.equal(response.status, 503); assert.equal(response.text, 'Serviço indisponível.')
        assert.equal((await account(5)).password, fixture.stored); assert.equal((await account(5)).session_version, 0)
        assert.equal((await failed.request('GET', '/session')).status, 401)
        const held = client(), pendingCommit = track(held.login('held-commit'))
        await until(async () => !holdCommit)
        const storedSessions = await db(fixtures.sessions).select('sess')
        assert.ok(storedSessions.every(row => (typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess).passport?.user?.id !== 7))
        gates.commit.resolve(); assert.equal((await pendingCommit).status, 200)
        const racing = client(), pendingRace = track(racing.login('changed-state'))
        await until(async () => !holdHash)
        await db(fixtures.users2).where({ id: 9 }).update({ active: 0 })
        gates.hash.resolve(); assert.equal((await pendingRace).status, 401)
        assert.equal((await account(9)).password, fixture.stored)
        progress('fixture-real-lock-waits')
        await control.beginTransaction(); blocking = true
        await control.query('SELECT id FROM ??.?? WHERE id=6 FOR UPDATE', [TARGET, fixtures.users2])
        const parallel = [track(client().login('parallel')), track(client().login('parallel'))]
        await until(async () => {
            const [[row]] = await control.query('SELECT COUNT(DISTINCT l.THREAD_ID) AS n FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE=w.ENGINE WHERE l.OBJECT_SCHEMA=? AND l.OBJECT_NAME=?', [TARGET, fixtures.users2])
            return Number(row.n) >= 2
        })
        await control.commit(); blocking = false
        const statuses = (await Promise.all(parallel)).map(result => result.status).sort()
        assert.deepEqual(statuses, [200, 401]); assert.equal((await account(6)).session_version, 1)
        await assertControl()
        ensure(audit.every(entry => entry.kind !== 'blocked' && entry.tables.every(name => names.includes(name))), 'E2B_FIXTURE_AUDIT_FAILED')
        for (const name of names) ensure(audit.some(entry => entry.tables.includes(name)), 'E2B_FIXTURE_ROUTE_NOT_EXERCISED')
        return { realHttpAndSqlPassed: true, fixtureAccounts: 9, sqlSessionsAndLimitsExercised: true,
            bcryptArgon2UpgradePassed: true, sessionCsrfRotationPassed: true, previousVersionRevoked: true,
            invalidAccountsRejected: true, rateLimit429Observed: true, injectedPreCommitFailureRolledBack: true,
            sessionAwaitedCommit: true, concurrentStateChangePreserved: true, innodbWaitersObserved: 2,
            concurrentLoginStatuses: statuses, fixtureQueries: audit.length, queryTargets: names }
    } finally {
        gates.commit.resolve(); gates.hash.resolve()
        if (blocking) await control.rollback()
        try {
            if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
        } finally { try { await legacy.close(); await Promise.allSettled(inFlight) } finally { await db.destroy() } }
    }
}

module.exports = { validateFixtures, sqlStore, until }
