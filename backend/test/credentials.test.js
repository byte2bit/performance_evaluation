const test = require('node:test')
const assert = require('node:assert/strict')
const knex = require('knex')
const { createCredentials } = require('../lib/auth/credentials')
const { createPasswords } = require('../lib/auth/passwords')
const { createLegacyBcrypt } = require('../lib/auth/legacy-bcrypt')
const { database, email } = require('./helpers/auth-harness')
const fixture = require('./helpers/legacy-bcrypt-fixture').ascii
const modern = value => '$argon2id$synthetic-fixture:' + value
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

function setup({ enableLegacy = true } = {}) {
    const { db, state } = database(), events = []
    const account = state.tables.users2[1]; account.password = fixture.stored
    const passwords = {
        async hash(value) { events.push('hash'); assert.equal(state.transactionOptions.length, 0); return modern(value) },
        async verify(stored, value) { events.push(['verify', stored]); return stored === modern(value) }
    }
    const legacy = { async verify(stored, value) { events.push('legacy'); return stored === fixture.stored && value === fixture.password } }
    const authenticate = createCredentials({ db, passwords, ...(enableLegacy ? { legacy } : {}) })
    return { db, state, account, events, passwords, legacy, authenticate }
}

test('default credentials reject bcrypt, preserve the dummy path and never create a transaction or write', async () => {
    const h = setup({ enableLegacy: false })
    assert.equal(await h.authenticate(email, fixture.password), false)
    assert.equal(h.account.password, fixture.stored); assert.equal(h.account.session_version, 0)
    assert.equal(h.state.writes.length, 0); assert.equal(h.state.transactionOptions.length, 0)
    assert.deepEqual(h.events, [['verify', fixture.stored]])
})

test('ordinary modern login and invalid public input preserve existing behavior without migration writes', async () => {
    const h = setup(); h.account.password = modern(fixture.password)
    const user = await h.authenticate(email.toUpperCase(), fixture.password)
    assert.equal(user.email, email); assert.equal(user.session_version, 0)
    assert.equal(await h.authenticate(email, 'wrong'), false)
    const before = h.state.queries.length
    for (const [address, password] of [['invalid', fixture.password], [email, ''], [email, 'a'.repeat(129)]]) assert.equal(await h.authenticate(address, password), false)
    assert.equal(h.state.queries.length, before); assert.equal(h.state.writes.length, 0)
    assert.equal(h.state.transactionOptions.length, 0); assert.equal(h.events.includes('legacy'), false)
})

test('opt-in migration hashes outside the transaction and returns only public identity with the committed new version', async () => {
    const h = setup(), before = structuredClone(h.account)
    const user = await h.authenticate(email, fixture.password)
    assert.deepEqual(user, { id: before.id, name: before.name, email, admin: false, session_version: 1 })
    assert.deepEqual(h.account, { ...before, password: modern(fixture.password), session_version: 1 })
    assert.deepEqual(h.events, ['legacy', 'hash'])
    assert.equal(h.state.queries.filter(query => query.lock === 'update').length, 1)
    assert.equal(h.state.transactionOptions.length, 1); assert.equal(h.state.writes.length, 1)
    // Subsequent modern login must not call legacy/hash or write again.
    h.events.length = 0
    assert.equal((await h.authenticate(email, fixture.password)).session_version, 1)
    assert.deepEqual(h.events, [['verify', modern(fixture.password)]])
    assert.equal(h.state.writes.length, 1)
})

test('inactive, deleted, nonexistent and incorrect-password accounts never migrate or implicitly activate', async () => {
    for (const issue of ['inactive', 'deleted', 'nonexistent', 'wrong']) {
        const h = setup(), before = structuredClone(h.state.tables)
        if (issue === 'inactive') h.account.active = 0
        if (issue === 'deleted') h.account.deletedAt = 'synthetic-date'
        const expected = structuredClone(h.state.tables)
        assert.equal(await h.authenticate(issue === 'nonexistent' ? 'absent@example.invalid' : email,
            issue === 'wrong' ? 'wrong-synthetic-password' : fixture.password), false)
        assert.deepEqual(h.state.tables, expected); assert.equal(h.state.writes.length, 0)
        assert.equal(h.state.transactionOptions.length, 0); assert.equal(h.events.includes('hash'), false)
        assert.ok(h.events.some(event => Array.isArray(event) && event[0] === 'verify'))
        if (issue !== 'wrong') assert.equal(h.events.includes('legacy'), false)
        assert.equal(before.users2[1].password, fixture.stored)
    }
})

test('the service enforces byte/NUL/revision limits even if an injected comparator would accept anything', async () => {
    for (const issue of ['bytes', 'nul', 'revision', 'cost']) {
        const h = setup(); let calls = 0
        h.legacy.verify = async () => { calls++; return true }
        if (issue === 'revision') h.account.password = fixture.stored.replace('$2a$', '$2b$')
        if (issue === 'cost') h.account.password = fixture.stored.replace('$10$', '$31$')
        assert.equal(await h.authenticate(email, issue === 'bytes' ? 'é'.repeat(37) : issue === 'nul' ? 'before\0after' : fixture.password), false)
        assert.equal(calls, 0); assert.equal(h.state.writes.length, 0); assert.equal(h.state.transactionOptions.length, 0)
    }
})

test('concurrent changes to hash, version, active, deletion, role or identity are preserved and reject the stale login', async () => {
    for (const change of [{ password: modern('new-synthetic-password') }, { session_version: 1 }, { active: 0 },
        { deletedAt: 'synthetic-date' }, { admin: 1 }, { email: 'renamed@example.invalid' }, { name: 'Nome atualizado fictício' }]) {
        const h = setup(), hashed = deferred(), release = deferred()
        h.passwords.hash = async value => { hashed.resolve(); await release.promise; return modern(value) }
        const login = h.authenticate(email, fixture.password)
        await hashed.promise; Object.assign(h.account, change)
        const expected = structuredClone(h.state.tables)
        release.resolve()
        assert.equal(await login, false)
        assert.deepEqual(h.state.tables, expected); assert.equal(h.state.writes.length, 0)
    }
})

test('two successful legacy verifications cannot both overwrite the hash or return an obsolete version', async () => {
    const h = setup(), bothHashed = deferred(), release = deferred(); let hashes = 0
    h.passwords.hash = async value => { if (++hashes === 2) bothHashed.resolve(); await release.promise; return modern(value) }
    const one = h.authenticate(email, fixture.password), two = h.authenticate(email, fixture.password)
    await bothHashed.promise; release.resolve()
    const results = await Promise.all([one, two])
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal(results.find(Boolean).session_version, 1)
    assert.equal(h.account.session_version, 1); assert.equal(h.account.password, modern(fixture.password))
})

test('worker or Argon2 failures do not start transactions or alter the account', async () => {
    for (const issue of ['worker', 'argon2', 'wrong-format']) {
        const h = setup(), before = structuredClone(h.state.tables)
        if (issue === 'worker') h.legacy.verify = async () => { throw new Error('synthetic private worker detail') }
        if (issue === 'argon2') h.passwords.hash = async () => { throw new Error('synthetic private hash detail') }
        if (issue === 'wrong-format') h.passwords.hash = async () => fixture.stored
        await assert.rejects(h.authenticate(email, fixture.password))
        assert.deepEqual(h.state.tables, before); assert.equal(h.state.writes.length, 0); assert.equal(h.state.transactionOptions.length, 0)
    }
})

test('a transaction/commit failure rolls back the prepared upgrade before returning an authenticated identity', async () => {
    const h = setup(), before = structuredClone(h.state.tables), transaction = h.db.transaction
    h.db.transaction = callback => transaction(async trx => {
        await callback(trx)
        throw new Error('synthetic private commit failure')
    })
    await assert.rejects(h.authenticate(email, fixture.password))
    assert.deepEqual(h.state.tables, before); assert.equal(h.state.writes.length, 0)
})

test('invalid or exhausted session versions fail before computing a new hash', async () => {
    for (const version of [-1, 1.5, 4294967295, Number.MAX_SAFE_INTEGER]) {
        const h = setup(); h.account.session_version = version
        await assert.rejects(h.authenticate(email, fixture.password))
        assert.equal(h.events.includes('hash'), false); assert.equal(h.state.writes.length, 0)
    }
})

test('real bcrypt and Argon2id preserve the same synthetic secret through the upgrade', async t => {
    const { db, state } = database(), passwords = createPasswords(), legacy = createLegacyBcrypt()
    t.after(() => legacy.close())
    state.tables.users2[1].password = fixture.stored
    const authenticate = createCredentials({ db, passwords, legacy })
    assert.equal((await authenticate(email, fixture.password)).session_version, 1)
    const upgraded = state.tables.users2[1].password
    assert.match(upgraded, /^\$argon2id\$/)
    assert.equal(await passwords.verify(upgraded, fixture.password), true)
    assert.equal(await passwords.verify(upgraded, 'wrong-synthetic-password'), false)
    assert.equal((await authenticate(email, fixture.password)).session_version, 1)
    assert.equal(state.writes.length, 1)
})

test('actual Knex generates a locked re-read and parameterized conditional update with no DDL, driver connection or extra writes', async () => {
    const db = knex({ client: 'mysql', log: { warn() {}, error() {} } }), queries = []
    let account = { id: 2, name: 'Conta sintética', email, password: fixture.stored, admin: 0, active: 1, deletedAt: null, session_version: 0 }
    const fakeConnection = { __knexUid: 'synthetic-credentials-connection' }
    db.client.acquireConnection = async () => fakeConnection
    db.client.releaseConnection = async () => {}
    db.client.acquireRawConnection = () => assert.fail('No driver connection allowed')
    fakeConnection.query = (query, bindings, callback) => {
        queries.push({ sql: query.sql, bindings })
        let response = {}
        if (/^select /i.test(query.sql)) response = [{ ...account }]
        else if (/^update /i.test(query.sql)) { account = { ...account, password: modern(fixture.password), session_version: 1 }; response = { affectedRows: 1 } }
        else assert.match(query.sql, /^(BEGIN|COMMIT);$/)
        callback(null, response, [])
    }
    try {
        const authenticate = createCredentials({ db, passwords: { async hash(value) { assert.equal(queries.some(q => q.sql === 'BEGIN;'), false); return modern(value) } },
            legacy: { async verify() { return true } } })
        assert.equal((await authenticate(email, fixture.password)).session_version, 1)
        assert.equal(queries.length, 5)
        assert.match(queries[2].sql, /where `id` = \? limit \? for update$/)
        assert.match(queries[3].sql, /^update `users2` set `password` = \?, `session_version` = \? where `id` = \? and `session_version` = \?$/)
        assert.deepEqual(queries[3].bindings, [modern(fixture.password), 1, 2, 0])
        assert.equal(queries.at(-1).sql, 'COMMIT;')
        assert.ok(queries.every(query => !/CREATE|ALTER|DROP|TRUNCATE|INSERT|DELETE/i.test(query.sql.replaceAll('`deletedAt`', ''))))
    } finally { await db.destroy() }
})
