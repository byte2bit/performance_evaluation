const assert = require('node:assert/strict')
const test = require('node:test')
const { harness, config, email, password } = require('./helpers/auth-harness')
const { validEvaluation } = require('./helpers/evaluation-fixture')
const { readConfig } = require('../lib/auth/config')
const { createPasswords, validPassword } = require('../lib/auth/passwords')
const { createLimits } = require('../lib/auth/limits')
const { createStore } = require('../lib/auth/session-store')
const { createAccounts } = require('../lib/auth/accounts')
const path = require('node:path')
const { EventEmitter } = require('node:events')

test('anonymous clients cannot read or mutate any existing business endpoint', async t => {
    const app = await harness(t); const client = app.client()
    for (const [method, url] of [
        ['GET', '/colab'], ['GET', '/colab/1'], ['POST', '/colab'], ['DELETE', '/colab/1'],
        ['GET', '/registros'], ['GET', '/registros/1'], ['GET', '/registros2?page=1&limit=25'],
        ['POST', '/registros'], ['POST', '/registros2'], ['DELETE', '/registros/1'], ['POST', '/mail'], ['POST', '/mail2']
    ]) assert.equal((await client.request(method, url, {})).status, 401)
    assert.equal(app.state.writes.length, 0)
    assert.equal(app.state.mails, 0)
    assert.equal(app.state.queries.length, 0)
})

test('login rotates the session and CSRF, sends a host-only HttpOnly cookie and returns only public identity', async t => {
    const app = await harness(t); const client = app.client()
    const token = await client.csrf(); const anonymousCookie = client.cookie
    const login = await client.request('POST', '/signin', { email: email.toUpperCase(), password }, { 'X-CSRF-Token': token })
    assert.equal(login.status, 200)
    assert.deepEqual(login.json(), { id: 2, name: 'Avaliador fictício', email, admin: false })
    assert.notEqual(client.cookie, anonymousCookie)
    assert.match(login.headers['set-cookie'][0], /HttpOnly/)
    assert.match(login.headers['set-cookie'][0], /SameSite=Lax/)
    assert.equal(/Domain=/i.test(login.headers['set-cookie'][0]), false)
    assert.equal(login.headers['access-control-allow-credentials'], 'true')
    assert.equal(login.headers['cache-control'], 'no-store')
    assert.equal((await client.request('GET', '/session')).status, 200)
    assert.notEqual(await client.csrf(), token)
    const stale = app.client(); stale.cookie = anonymousCookie
    assert.equal((await stale.request('GET', '/session')).status, 401)
    assert.equal((await client.request('POST', '/signout', {}, { 'X-CSRF-Token': token })).status, 403)
})

test('unknown, inactive, deleted and incorrect-password accounts use the same generic response', async t => {
    const app = await harness(t)
    for (const [account, secret] of [['absent@example.invalid', password], ['inactive@example.invalid', password],
        ['deleted@example.invalid', password], [email, 'synthetic-wrong-password']]) {
        const response = await app.client().login(account, secret)
        assert.equal(response.status, 401)
        assert.equal(response.text, 'E-mail ou senha inválidos.')
    }
})

test('CSRF and exact Origin are required, including login and logout', async t => {
    const app = await harness(t); const client = app.client()
    assert.equal((await client.request('POST', '/signin', { email, password })).status, 403)
    await client.login()
    const token = await client.csrf()
    for (const headers of [{}, { 'X-CSRF-Token': 'invalid' }, { 'X-CSRF-Token': token, Origin: 'https://unrelated.example' },
        { 'X-CSRF-Token': token, Origin: '' }, { 'X-CSRF-Token': token, 'Content-Type': 'text/plain' }]) {
        assert.equal((await client.request('POST', '/signout', {}, headers)).status, 403)
    }
    assert.equal((await client.request('GET', '/session')).status, 200)
    const cookie = client.cookie
    assert.equal((await client.request('POST', '/signout', {}, { 'X-CSRF-Token': token })).status, 204)
    const replay = app.client(); replay.cookie = cookie
    assert.equal((await replay.request('GET', '/registros')).status, 401)
})

test('evaluators receive records and professionals in their current assignment through both list paths and IDs', async t => {
    const app = await harness(t); const client = app.client(); await client.login()
    for (const url of ['/registros?admin=true&demandante=other@example.invalid', '/registros2?page=1&limit=25', '/colab']) {
        const result = await client.request('GET', url)
        assert.equal(result.status, 200)
        assert.deepEqual(result.json().map(row => row.id), [1])
    }
    for (const root of ['/registros', '/colab']) {
        assert.equal((await client.request('GET', root + '/1')).status, 200)
        assert.equal((await client.request('GET', root + '/2')).status, 404)
    }
    const admin = app.client(); await admin.login('admin@example.invalid')
    assert.equal((await admin.request('GET', '/registros')).json().length, 2)
})

test('record writes use session identity, ignore protected fields and reject professionals outside scope', async t => {
    const app = await harness(t); const client = app.client(); await client.login()
    const headers = { 'X-CSRF-Token': await client.csrf() }
    for (const url of ['/registros', '/registros2']) {
        const own = await client.request('POST', url, validEvaluation({ demandante: 'other@example.invalid',
            id: 999, admin: true, created_at: 'synthetic' }), headers)
        assert.equal(own.status, 204)
        const saved = app.state.tables.registros.at(-1)
        assert.equal(saved.demandante, email)
        assert.equal(saved.colab_id, 1)
        assert.notEqual(saved.id, 999)
        assert.equal(saved.admin, undefined)
        assert.equal(saved.created_at, undefined)
        const count = app.state.tables.registros.length
        assert.equal((await client.request('POST', url, validEvaluation({ colab: 'Profissional B' }), headers)).status, 403)
        assert.equal(app.state.tables.registros.length, count)
    }
})

test('admin-only operations deny evaluators and re-read role from the server on each request', async t => {
    const app = await harness(t); const client = app.client(); await client.login()
    const headers = { 'X-CSRF-Token': await client.csrf() }
    for (const [method, url] of [['DELETE', '/registros/1'], ['DELETE', '/colab/1'], ['POST', '/colab'], ['POST', '/mail'], ['POST', '/mail2']]) {
        assert.equal((await client.request(method, url, { admin: true }, headers)).status, 403)
    }
    assert.equal(app.state.writes.length, 0); assert.equal(app.state.mails, 0)
    const admin = app.client(); await admin.login('admin@example.invalid')
    const token = await admin.csrf()
    assert.equal((await admin.request('POST', '/mail', {}, { 'X-CSRF-Token': token })).status, 204)
    app.state.tables.users2[0].admin = 0
    assert.equal((await admin.request('POST', '/mail2', { admin: true }, { 'X-CSRF-Token': token })).status, 403)
    assert.equal(app.state.mails, 1)
})

for (const change of ['version', 'active', 'deletedAt']) {
    test(`existing sessions are revoked after account ${change} changes`, async t => {
        const app = await harness(t); const client = app.client(); await client.login()
        const account = app.state.tables.users2[1]
        if (change === 'version') account.session_version++
        if (change === 'active') account.active = 0
        if (change === 'deletedAt') account.deletedAt = 'synthetic-date'
        assert.equal((await client.request('GET', '/session')).status, 401)
        assert.equal((await client.request('GET', '/registros')).status, 401)
    })
}

test('server enforces inactivity and an absolute session duration despite ongoing activity', async t => {
    const app = await harness(t); const client = app.client(); await client.login()
    app.state.now += config().idleMs
    assert.equal((await client.request('GET', '/session')).status, 401)
    await client.login()
    for (let index = 0; index < 23; index++) {
        app.state.now += 20 * 60 * 1000
        assert.equal((await client.request('GET', '/session')).status, 200)
    }
    app.state.now += 20 * 60 * 1000
    assert.equal((await client.request('GET', '/session')).status, 401)
})

test('password changes require the current password and revoke every previous session', async t => {
    const app = await harness(t); const first = app.client(); const second = app.client()
    await first.login(); await second.login()
    const headers = { 'X-CSRF-Token': await first.csrf() }
    assert.equal((await first.request('POST', '/change-password', { currentPassword: password, newPassword: 'short' }, headers)).status, 400)
    assert.equal((await first.request('POST', '/change-password', { currentPassword: 'wrong', newPassword: password + '-new' }, headers)).status, 401)
    assert.equal((await first.request('GET', '/session')).status, 200)
    assert.equal((await first.request('POST', '/change-password', { currentPassword: password, newPassword: password + '-new' }, headers)).status, 204)
    assert.equal(app.state.tables.users2[1].session_version, 1)
    assert.equal((await second.request('GET', '/session')).status, 401)
    assert.equal((await app.client().login(email, password)).status, 401)
    assert.equal((await app.client().login(email, password + '-new')).status, 200)
})

test('store and rate-limit failures fail closed without exposing internal diagnostics', async t => {
    const app = await harness(t); const client = app.client()
    for (const status of [429, 503]) {
        app.state.limits.signin = status
        assert.equal((await client.login()).status, status)
        assert.equal(app.state.queries.length, 0)
    }
    delete app.state.limits.signin
    await client.login()
    app.store.get = (sid, callback) => callback(new Error('synthetic SQL and credential detail'))
    const response = await client.request('GET', '/registros')
    assert.equal(response.status, 503)
    assert.equal(response.text.includes('synthetic'), false)
})

test('configuration rejects missing secrets, broad proxy shortcuts and insecure production origins', () => {
    assert.throws(() => readConfig({}), /SESSION_SECRET/)
    const env = { SESSION_SECRET: 'synthetic-session-secret-for-tests-only', AUTH_RATE_LIMIT_SECRET: 'synthetic-rate-limit-secret-for-tests-only' }
    for (const extra of [{ FRONTEND_ORIGIN: '*' }, { FRONTEND_ORIGIN: 'http://example.invalid' }, { TRUST_PROXY: 'true' },
        { FRONTEND_ORIGIN: 'https://frontend.example.invalid' },
        { TRUST_PROXY: '1' }, { TRUST_PROXY: '0.0.0.0/0' }, { NODE_ENV: 'production' },
        { NODE_ENV: 'production', FRONTEND_ORIGIN: 'http://localhost:5173', SESSION_SAME_SITE: 'lax' }]) {
        assert.throws(() => readConfig({ ...env, ...extra }))
    }
    const production = readConfig({ ...env, NODE_ENV: 'production', FRONTEND_ORIGIN: 'https://frontend.example.invalid', SESSION_SAME_SITE: 'lax', TRUST_PROXY: '127.0.0.1' })
    assert.equal(production.cookieName, '__Host-evaluation.sid')
    assert.equal(production.production, true)
})

test('Argon2id supports the approved cost and handles unknown/legacy hashes using a dummy verification', async () => {
    const passwords = createPasswords()
    const hash = await passwords.hash(password)
    assert.equal(hash.startsWith('$argon2id$v=19$'), true)
    const params = Object.fromEntries(hash.split('$')[3].split(',').map(part => {
        const [key, value] = part.split('='); return [key, Number(value)]
    }))
    assert.deepEqual(params, { m: 19456, t: 2, p: 1 })
    assert.equal(await passwords.verify(hash, password), true)
    assert.equal(await passwords.verify(hash, password + '-wrong'), false)
    assert.equal(await passwords.verify(undefined, password), false)
    assert.equal(await passwords.verify('legacy-synthetic', password), false)
    assert.equal(await passwords.verify('$argon2id$malformed-synthetic', password), false)
    assert.equal(validPassword(' '.repeat(15)), true)
    assert.equal(validPassword('á'.repeat(128)), true)
    assert.equal(validPassword('á'.repeat(129)), false)
})

test('SQL session store never creates schema and reports rejected operations exactly once', async () => {
    const store = createStore({ schema: { async hasTable() { return false }, createTable() { assert.fail('DDL is forbidden') } } })
    await assert.rejects(store.ready)
    let callbacks = 0
    await new Promise(resolve => store.get('synthetic', error => { callbacks++; assert.ok(error); resolve() }))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(callbacks, 1)
    await new Promise(resolve => store.touch('synthetic', {}, error => { assert.ok(error); resolve() }))
})

test('shared limiters use HMAC keys, disable auto-DDL and return 429/503 without fallback', async () => {
    const budgets = []
    let rejection
    class Limiter {
        constructor(options) { this.options = options; budgets.push(this) }
        async consume(key) { this.key = key; if (rejection) throw rejection }
    }
    const limit = createLimits({ client: { config: { connection: { database: 'synthetic_database' } } } }, config(), Limiter)
    const req = { ip: '203.0.113.1', body: { email }, user: { id: 2 } }
    const res = { headers: {}, set(key, value) { this.headers[key] = value }, status(value) { this.code = value; return this }, send() {} }
    let passed = false
    await limit('signin')(req, res, () => { passed = true })
    assert.equal(passed, true)
    assert.ok(budgets.every(item => item.options.tableCreated && item.options.clearExpiredByTimeout === false))
    assert.ok(budgets.filter(item => item.key).every(item => /^[a-f0-9]{64}$/.test(item.key)))
    rejection = { msBeforeNext: 1500 }
    await limit('signin')(req, res, () => assert.fail('Limit bypass'))
    assert.equal(res.code, 429); assert.equal(res.headers['Retry-After'], '2')
    rejection = new Error('synthetic DB failure')
    await limit('signin')(req, res, () => assert.fail('Store failure bypass'))
    assert.equal(res.code, 503)
})

test('administrative operations hash new accounts, revoke sessions and preserve the last active admin', async t => {
    const { db, state } = await harness(t)
    const accounts = createAccounts(db, { async hash(value) { return 'hash:' + value } })
    await accounts.create({ name: 'Conta fictícia', email: 'NEW@EXAMPLE.INVALID ', password })
    assert.equal(state.tables.users2.at(-1).email, 'new@example.invalid')
    assert.equal(state.tables.users2.at(-1).password, 'hash:' + password)
    assert.equal(state.tables.users2.at(-1).admin, false)
    await assert.rejects(accounts.change(1, 'disable'), /administrador/)
    await accounts.change(2, 'disable')
    assert.equal(state.tables.users2[1].active, false)
    assert.equal(state.tables.users2[1].session_version, 1)
    await accounts.change(2, 'activate', password + '-new')
    await accounts.change(2, 'promote')
    await accounts.change(1, 'demote')
    assert.equal(state.tables.users2[0].admin, false)
    await assert.rejects(accounts.change(2, 'demote'), /administrador/)
})

test('HTTPS mode rejects spoofed forwarded protocol from untrusted clients and sends secure host-only cookies through a trusted proxy', async t => {
    const production = { ...config(), production: true, origin: 'https://frontend.example.invalid',
        cookieName: '__Host-evaluation.sid', trustProxy: ['127.0.0.1'] }
    const trusted = await harness(t, { authConfig: production })
    const client = trusted.client()
    assert.equal((await client.request('GET', '/csrf-token')).status, 503)
    const response = await client.request('GET', '/csrf-token', undefined, { 'X-Forwarded-Proto': 'https' })
    assert.equal(response.status, 200)
    assert.match(response.headers['set-cookie'][0], /^__Host-evaluation\.sid=/)
    assert.match(response.headers['set-cookie'][0], /; Secure/)
    assert.equal(/Domain=/i.test(response.headers['set-cookie'][0]), false)
    const untrusted = await harness(t, { authConfig: { ...production, trustProxy: ['192.0.2.1'] } })
    assert.equal((await untrusted.client().request('GET', '/csrf-token', undefined, { 'X-Forwarded-Proto': 'https' })).status, 503)
})

test('preflight is anonymous and unavailable session schema fails closed without creating tables', async t => {
    const app = await harness(t); const client = app.client()
    const preflight = await client.request('OPTIONS', '/signin', undefined, { 'Access-Control-Request-Method': 'POST' })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers['access-control-allow-credentials'], 'true')
    assert.equal(app.state.queries.length, 0)
    app.store.ready = Promise.reject(new Error('synthetic missing schema'))
    app.store.ready.catch(() => {})
    const response = await client.request('GET', '/csrf-token')
    assert.equal(response.status, 503)
    assert.equal(response.text.includes('schema'), false)
})

test('account CLI never echoes passwords, restores terminal state and rejects noninteractive/missing target use', async () => {
    const { main, hiddenPassword } = require('../scripts/accounts')
    await assert.rejects(main([]))
    const input = new EventEmitter()
    input.isRaw = false
    input.setRawMode = value => { input.isRaw = value }
    input.resume = input.pause = () => {}
    let output = ''
    const pending = hiddenPassword('Senha: ', input, { write(value) { output += value } })
    input.emit('data', Buffer.from('synthetic-secret\r'))
    assert.equal(await pending, 'synthetic-secret')
    assert.equal(output.includes('synthetic-secret'), false)
    assert.equal(input.isRaw, false)
    assert.equal(input.listenerCount('data'), 0)
})

test('new migrations compile MySQL DDL without applying it or opening any connection', async () => {
    const knex = require('knex')({ client: 'mysql' })
    try {
        const files = ['20261025000100_add_auth_state_to_users2', '20261025000200_create_sessions', '20261025000300_create_auth_rate_limits']
        const compiled = files.flatMap(file => require('../migrations/' + file).up(knex).toSQL().map(statement => statement.sql))
        assert.ok(compiled.some(sql => sql.includes('`users2`') && sql.includes('`active`')))
        assert.ok(compiled.some(sql => sql.includes('`sessions`') && sql.includes('json')))
        assert.ok(compiled.some(sql => sql.includes('`auth_rate_limits`')))
        assert.equal(compiled.some(sql => /drop|delete|truncate/i.test(sql)), false)
    } finally { await knex.destroy() }
})

test('real Consign order loads local authentication and handlers without reading application credentials', async () => {
    const express = require('express')
    const { db } = require('./helpers/auth-harness').database()
    db.schema = { async hasTable() { return true } }
    db.client = { config: { connection: { database: 'synthetic_database' } } }
    const app = express(); app.db = db
    const names = ['NODE_ENV', 'SESSION_SECRET', 'AUTH_RATE_LIMIT_SECRET', 'FRONTEND_ORIGIN', 'SESSION_SAME_SITE', 'TRUST_PROXY']
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]))
    const credentialsBefore = Object.keys(require.cache).filter(file => /[/\\]\.env$/.test(file))
    try {
        for (const name of names) delete process.env[name]
        process.env.NODE_ENV = 'development'
        process.env.SESSION_SECRET = config().secret
        process.env.AUTH_RATE_LIMIT_SECRET = config().rateSecret
        require('consign')({ cwd: path.resolve(__dirname, '..'), verbose: false })
            .include('./config/passport.js').then('./config/middlewares.js').then('./api/validation.js')
            .then('./api').then('./config/routes.js').into(app)
        await app.config.passport.ready({}, { status() { throw new Error('Unexpected readiness failure') } }, () => {})
        assert.equal(app.api.auth.signin, app.config.passport.handlers.signin)
        assert.equal(typeof app.api.user.getColab, 'function')
        assert.equal(typeof app.api.registros.saveReg, 'function')
        assert.equal(app.config.passport.passport._strategies.jwt, undefined)
        assert.ok(app.config.passport.passport._strategies.local)
        assert.deepEqual(Object.keys(require.cache).filter(file => /[/\\]\.env$/.test(file)), credentialsBefore)
    } finally {
        for (const name of names) {
            if (previous[name] === undefined) delete process.env[name]
            else process.env[name] = previous[name]
        }
    }
})
