const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { randomBytes } = require('node:crypto')
const { MemoryStore } = require('express-session')
const { database, password, email } = require('./helpers/auth-harness')
const fixture = require('./helpers/legacy-bcrypt-fixture').ascii
const { previewConfig, childEnvironment, composeApp, validPersistedHash, cookieName, frontendOrigin, verifyPublished } = require('../scripts/local-inova-preview')
const { validateScopes } = require('../scripts/local-inova-maps')
const { createPasswords } = require('../lib/auth/passwords')
const secrets = { session: 'a'.repeat(64), rate: 'b'.repeat(64) }, nonce = 'c'.repeat(32)

test('preview uses exact local origin and its own host-only cookie without relaxing the default configuration', () => {
    const config = previewConfig(secrets)
    assert.equal(config.origin, 'http://localhost:5174'); assert.equal(config.cookieName, cookieName)
    assert.notEqual(config.cookieName, 'evaluation.sid'); assert.equal(config.production, false)
    assert.deepEqual(config.trustProxy, []); assert.equal(config.sameSite, 'lax')
    for (const value of [{}, { session: secrets.session, rate: secrets.session }, { session: 'short', rate: secrets.rate }]) assert.throws(() => previewConfig(value))
})

test('children receive only explicit settings; frontend receives no backend key, SMTP or inherited preload', () => {
    const environment = { PATH: 'synthetic-path', LOCALAPPDATA: 'synthetic-local-appdata', EVAL_INOVA_SESSION: secrets.session, EVAL_INOVA_RATE: secrets.rate,
        EVAL_LOCAL_COPY_INVENTORY_SECRET: 'd'.repeat(64), EVAL_LOCAL_COPY_BACKUP_KEY: 'e'.repeat(64), SMTP_PASSWORD: 'synthetic',
        SESSION_SECRET: 'unrelated', AWS_SECRET_ACCESS_KEY: 'synthetic', NODE_OPTIONS: '--require synthetic', VITE_API_URL: 'https://wrong.example.invalid' }
    const api = childEnvironment(environment, nonce), frontend = childEnvironment(environment, nonce, true)
    assert.equal(api.EVAL_INOVA_SESSION, secrets.session); assert.equal(api.EVAL_LOCAL_COPY_INVENTORY_SECRET, 'd'.repeat(64))
    for (const key of ['SMTP_PASSWORD', 'SESSION_SECRET', 'AWS_SECRET_ACCESS_KEY', 'NODE_OPTIONS', 'EVAL_LOCAL_COPY_BACKUP_KEY']) assert.equal(api[key], undefined)
    for (const key of ['EVAL_INOVA_SESSION', 'EVAL_INOVA_RATE', 'EVAL_LOCAL_COPY_INVENTORY_SECRET']) assert.equal(frontend[key], undefined)
    assert.equal(frontend.VITE_API_URL, 'http://localhost:8002'); assert.equal(frontend.EVAL_INOVA_PREVIEW_NONCE, nonce)
    assert.throws(() => childEnvironment(environment, 'invalid'))
})

test('startup accepts legitimate progressive Argon2id hashes and rejects arbitrary costs, formats or revisions', async () => {
    const modern = await createPasswords().hash(password)
    assert.equal(validPersistedHash(modern), true); assert.equal(validPersistedHash(fixture.stored), true)
    const reordered = modern.split('$'); reordered[3] = 'm=19456,t=2,p=1'
    assert.equal(validPersistedHash(reordered.join('$')), true)
    reordered[3] = 'm=19456,p=1,p=1'; assert.equal(validPersistedHash(reordered.join('$')), false)
    for (const value of [null, '$argon2id$malformed', modern.replace('m=19456', 'm=999999999'), fixture.stored.replace('$2a$', '$2b$'), fixture.stored.replace('$10$', '$31$')]) assert.equal(validPersistedHash(value), false)
})

test('preview composition and publication checks reject invalid capabilities/settings before SQL or private files', async () => {
    const db = () => assert.fail('No database use for invalid composition')
    assert.throws(() => composeApp({ db, secrets, nonce }))
    assert.throws(() => composeApp({ db, secrets: {}, nonce, legacy: { verify() {} } }))
    await assert.rejects(verifyPublished('not-a-private-directory', { kind: 'wrong' }, {}, 'a'.repeat(64)))
})

test('real Consign preserves injected preview authentication, mounts all routes and blocks SMTP', async t => {
    const { db, state } = database(), store = new MemoryStore(), mailer = require('nodemailer'), oldTransport = mailer.createTransport
    const passwords = { async hash(value) { return '$argon2id$synthetic:' + value }, async verify(stored, value) { return stored === 'hash:' + value || stored === '$argon2id$synthetic:' + value } }
    let legacyCalls = 0
    const composed = composeApp({ db, secrets, nonce, store, passwords, legacy: { async verify(stored, value) { legacyCalls++; return stored === fixture.stored && value === fixture.password } },
        limit: () => (req, res, next) => next() })
    t.after(() => { mailer.createTransport = oldTransport })
    assert.equal(composed.app.config.passport, composed.auth)
    assert.equal(composed.auth.config.cookieName, cookieName)
    assert.throws(() => mailer.createTransport({}), { code: 'SMTP_FORBIDDEN_LOCAL_PREVIEW' })
    const server = http.createServer(composed.app)
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
    let cookie = ''
    const request = (method, url, data, headers = {}) => new Promise((resolve, reject) => {
        const body = data === undefined ? '' : JSON.stringify(data)
        const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: url, method,
            headers: { Origin: frontendOrigin, 'Content-Type': 'application/json', Cookie: cookie, 'Content-Length': Buffer.byteLength(body), ...headers } }, response => {
            const chunks = []; const saved = response.headers['set-cookie']?.[0]; if (saved) cookie = saved.split(';')[0]
            response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, json: () => JSON.parse(Buffer.concat(chunks).toString()) }))
        }); req.once('error', reject); req.end(body)
    })
    assert.equal((await request('GET', '/__inova_preview')).json().nonce, nonce)
    assert.equal((await request('GET', '/registros')).status, 401)
    const csrf = (await request('GET', '/csrf-token')).json().csrfToken
    state.tables.users2[1].password = fixture.stored
    assert.equal((await request('POST', '/signin', { email, password: fixture.password }, { 'X-CSRF-Token': csrf })).status, 200)
    assert.equal(legacyCalls, 1); assert.equal(state.tables.users2[1].session_version, 1)
    assert.match(cookie, /^evaluation\.inova\.local\.sid=/)
    assert.equal((await request('GET', '/registros')).status, 200)
    assert.equal((await request('GET', '/gerencias')).status, 200)
    assert.equal((await request('GET', '/demandantes')).status, 403)
    assert.equal((await request('GET', '/session')).status, 200)
})

test('SQL scope verification uses three distinct actors even when the chosen owner is an administrator', async () => {
    const { db, state } = database()
    const accounts = [{ id: 12, name: 'Synthetic owner', email: 'owner@example.invalid', admin: 1, active: 1, deletedAt: null, session_version: 1 },
        { id: 40, name: 'Synthetic admin', email: 'admin2@example.invalid', admin: 1, active: 1, deletedAt: null, session_version: 1 },
        { id: 50, name: 'Synthetic evaluator', email: 'evaluator@example.invalid', admin: 0, active: 1, deletedAt: null, session_version: 1 }]
    state.tables.users2 = accounts
    state.tables.gerencias = [{ id: 1, demandante_id: 12 }]
    state.tables.colab = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, gerencia_id: 1 }))
    state.tables.registros = Array.from({ length: 498 }, (_, i) => ({ id: i + 1, colab_id: i < 395 ? i % 100 + 1 : null }))
    const result = await validateScopes(db, accounts, { pending: [{ id: 396 }] })
    assert.deepEqual(result, [{ actor: 'chosen-owner', recordsVisible: 498 }, { actor: 'administrator', recordsVisible: 498 }, { actor: 'unassigned-evaluator', recordsVisible: 0 }])
    assert.equal(state.writes.length, 0)
})
