const test = require('node:test')
const assert = require('node:assert/strict')
const { harness, email } = require('./helpers/auth-harness')
const fixture = require('./helpers/legacy-bcrypt-fixture').ascii
const { createCredentials } = require('../lib/auth/credentials')
const { createLegacyBcrypt } = require('../lib/auth/legacy-bcrypt')
const { createPasswords } = require('../lib/auth/passwords')
const modern = value => '$argon2id$synthetic-http-fixture:' + value
const passwords = { async hash(value) { return modern(value) }, async verify(stored, value) { return stored === modern(value) } }
const legacy = { async verify(stored, value) { return stored === fixture.stored && value === fixture.password } }
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const sessions = store => new Promise((resolve, reject) => store.all((error, value) => error ? reject(error) : resolve(value)))
const optIn = (verifier = legacy) => ({ db, passwords }) => createCredentials({ db, passwords, legacy: verifier })

test('HTTP default rejects bcrypt even with a client-supplied opt-in flag and leaves hash/state unchanged', async t => {
    const app = await harness(t, { passwordService: createPasswords() }), client = app.client()
    app.state.tables.users2[1].password = fixture.stored
    const before = structuredClone(app.state.tables)
    const response = await client.request('POST', '/signin', { email, password: fixture.password, legacyBcrypt: true, profile: 'approved-copy' },
        { 'X-CSRF-Token': await client.csrf() })
    assert.equal(response.status, 401); assert.equal(response.text, 'E-mail ou senha inválidos.')
    assert.deepEqual(app.state.tables, before); assert.equal(app.state.writes.length, 0)
    assert.equal((await client.request('GET', '/session')).status, 401)
})

test('opt-in HTTP login with real bcrypt/Argon2 rotates session/CSRF, commits the new hash and revokes the previous version', async t => {
    const pool = createLegacyBcrypt(), realPasswords = createPasswords(); let legacyCalls = 0
    t.after(() => pool.close())
    const verifier = { async verify(...args) { legacyCalls++; return pool.verify(...args) } }
    const app = await harness(t, { passwordService: realPasswords, credentialsFactory: optIn(verifier) })
    const account = app.state.tables.users2[1], previous = app.client(), client = app.client()
    account.password = await realPasswords.hash(fixture.password)
    assert.equal((await previous.login(email, fixture.password)).status, 200)
    assert.equal(legacyCalls, 0); assert.equal(app.state.writes.length, 0)
    // Synthetic fixture creates a pre-upgrade session; no SQL account is used.
    account.password = fixture.stored
    const csrfBefore = await client.csrf(), cookieBefore = client.cookie
    const response = await client.request('POST', '/signin', { email, password: fixture.password }, { 'X-CSRF-Token': csrfBefore })
    assert.equal(response.status, 200); assert.equal(legacyCalls, 1)
    assert.notEqual(client.cookie, cookieBefore)
    assert.match(response.headers['set-cookie'][0], /HttpOnly/)
    assert.match(response.headers['set-cookie'][0], /SameSite=Lax/)
    assert.deepEqual(Object.keys(response.json()).sort(), ['admin', 'email', 'id', 'name'])
    assert.equal(response.text.includes(fixture.password), false); assert.equal(response.text.includes(fixture.stored), false)
    assert.match(account.password, /^\$argon2id\$/); assert.equal(account.session_version, 1)
    assert.equal(await realPasswords.verify(account.password, fixture.password), true)
    assert.equal(app.state.writes.length, 1)
    assert.equal((await client.request('GET', '/session')).status, 200)
    assert.equal((await previous.request('GET', '/session')).status, 401)
    const csrfAfter = await client.csrf()
    assert.notEqual(csrfAfter, csrfBefore)
    assert.equal((await client.request('POST', '/signout', {}, { 'X-CSRF-Token': csrfBefore })).status, 403)
    assert.equal((await client.request('POST', '/mail', {}, { 'X-CSRF-Token': csrfAfter })).status, 403)
    assert.equal((await client.request('POST', '/signout', {}, { 'X-CSRF-Token': csrfAfter })).status, 204)
    assert.equal((await app.client().login(email, fixture.password)).status, 200)
    assert.equal(legacyCalls, 1); assert.equal(app.state.writes.length, 1)
})

test('Passport cannot establish an authenticated session until the upgrade transaction has committed', async t => {
    const app = await harness(t, { passwordService: passwords, credentialsFactory: optIn() }), client = app.client()
    app.state.tables.users2[1].password = fixture.stored
    const prepared = deferred(), release = deferred(), transaction = app.db.transaction
    t.after(() => release.resolve())
    app.db.transaction = callback => transaction(async trx => {
        const identity = await callback(trx)
        prepared.resolve(); await release.promise
        return identity
    })
    const login = client.login(email, fixture.password)
    await prepared.promise
    assert.ok(Object.values(await sessions(app.store)).every(session => !session.passport?.user))
    release.resolve()
    assert.equal((await login).status, 200)
    assert.equal((await client.request('GET', '/session')).status, 200)
    assert.ok(Object.values(await sessions(app.store)).some(session => session.passport?.user?.version === 1))
})

test('commit failure returns generic 503, restores the legacy fixture and never authenticates a session', async t => {
    const app = await harness(t, { passwordService: passwords, credentialsFactory: optIn() }), client = app.client()
    app.state.tables.users2[1].password = fixture.stored
    const before = structuredClone(app.state.tables), transaction = app.db.transaction
    app.db.transaction = callback => transaction(async trx => {
        await callback(trx)
        throw new Error('synthetic private SQL detail ' + fixture.password + ' ' + fixture.stored)
    })
    const result = await client.login(email, fixture.password)
    assert.equal(result.status, 503); assert.equal(result.text, 'Serviço indisponível.')
    assert.deepEqual(app.state.tables, before); assert.equal(app.state.writes.length, 0)
    assert.equal((await client.request('GET', '/session')).status, 401)
    assert.ok(Object.values(await sessions(app.store)).every(session => !session.passport?.user))
})

test('worker failure and wrong password cannot produce a session or any hash/state write', async t => {
    for (const failure of [true, false]) {
        const verifier = { async verify() { if (failure) throw new Error('synthetic private worker detail'); return false } }
        const app = await harness(t, { passwordService: passwords, credentialsFactory: optIn(verifier) }), client = app.client()
        app.state.tables.users2[1].password = fixture.stored
        const response = await client.login(email, fixture.password)
        assert.equal(response.status, failure ? 503 : 401)
        assert.equal(response.text, failure ? 'Serviço indisponível.' : 'E-mail ou senha inválidos.')
        assert.equal(app.state.writes.length, 0); assert.equal(app.state.tables.users2[1].password, fixture.stored)
        assert.equal((await client.request('GET', '/session')).status, 401)
    }
})

test('a concurrent profile/state change rejects HTTP login without overwriting the newer decision', async t => {
    const hashing = deferred(), release = deferred()
    const delayedPasswords = { ...passwords, async hash(value) { hashing.resolve(); await release.promise; return modern(value) } }
    const app = await harness(t, { passwordService: delayedPasswords, credentialsFactory: optIn() }), client = app.client()
    app.state.tables.users2[1].password = fixture.stored
    t.after(() => release.resolve())
    const login = client.login(email, fixture.password)
    await hashing.promise; app.state.tables.users2[1].active = 0
    release.resolve()
    assert.equal((await login).status, 401)
    assert.equal(app.state.tables.users2[1].active, 0); assert.equal(app.state.tables.users2[1].password, fixture.stored)
    assert.equal(app.state.writes.length, 0)
    assert.equal((await client.request('GET', '/session')).status, 401)
})

test('Origin/CSRF/rate limits still run before the opt-in credential verifier or database', async t => {
    let calls = 0
    const verifier = { async verify() { calls++; return true } }
    const app = await harness(t, { passwordService: passwords, credentialsFactory: optIn(verifier) }), client = app.client()
    app.state.tables.users2[1].password = fixture.stored
    const payload = { email, password: fixture.password }, token = await client.csrf()
    assert.equal((await client.request('POST', '/signin', payload)).status, 403)
    assert.equal((await client.request('POST', '/signin', payload, { 'X-CSRF-Token': token, Origin: 'https://untrusted.example.invalid' })).status, 403)
    app.state.limits.signin = 429
    assert.equal((await client.request('POST', '/signin', payload, { 'X-CSRF-Token': token })).status, 429)
    assert.equal(calls, 0); assert.equal(app.state.queries.length, 0); assert.equal(app.state.writes.length, 0)
})
