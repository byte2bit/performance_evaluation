const assert = require('node:assert/strict')
const test = require('node:test')
const knex = require('knex')
const { harness, email } = require('./helpers/auth-harness')
const { validEvaluation } = require('./helpers/evaluation-fixture')
const { scopeRecords } = require('../lib/records')
const migration = require('../migrations/20261026000100_link_registros_to_colab_id')

test('a current assignment transfers all linked history and revokes previous-owner reads without rewriting authors', async t => {
    const app = await harness(t)
    const previous = app.client(); await previous.login()
    const current = app.client(); await current.login('other@example.invalid')
    const admin = app.client(); await admin.login('admin@example.invalid')
    app.state.tables.registros.push(
        { id: 3, colab_id: 1, colab: 'Profissional A', demandante: 'admin@example.invalid' },
        { id: 4, colab_id: null, colab: 'Profissional A', demandante: email },
        { id: 5, colab_id: 999, colab: 'Profissional A', demandante: email }
    )
    const snapshots = structuredClone(app.state.tables.registros)
    for (const url of ['/registros', '/registros2?page=1&limit=100']) {
        assert.deepEqual((await previous.request('GET', url)).json().map(row => row.id), [1, 3])
    }
    // Fixture-only reassignment. No public editing endpoint or real database.
    app.state.tables.colab[0].demandante = 'other@example.invalid'
    for (const url of ['/registros?demandante=' + email, '/registros2?page=1&limit=100']) {
        assert.deepEqual((await previous.request('GET', url)).json(), [])
        const rows = (await current.request('GET', url)).json()
        assert.deepEqual(rows.map(row => row.id), [1, 2, 3])
        assert.equal(rows.find(row => row.id === 1).demandante, email)
        assert.equal(rows.find(row => row.id === 3).demandante, 'admin@example.invalid')
        assert.equal((await admin.request('GET', url)).json().length, 5)
    }
    for (const id of [1, 3]) {
        assert.equal((await previous.request('GET', '/registros/' + id)).status, 404)
        assert.equal((await current.request('GET', '/registros/' + id)).status, 200)
    }
    for (const id of [4, 5]) {
        assert.equal((await previous.request('GET', '/registros/' + id)).status, 404)
        assert.equal((await current.request('GET', '/registros/' + id)).status, 404)
        assert.equal((await admin.request('GET', '/registros/' + id)).status, 200)
    }
    assert.equal((await previous.request('GET', '/session')).status, 200)
    assert.deepEqual(app.state.tables.registros, snapshots)
    assert.equal(app.state.writes.length, 0)

    app.state.tables.colab[0].demandante = email
    assert.equal((await previous.request('GET', '/registros/1')).status, 200)
    assert.equal((await current.request('GET', '/registros/1')).status, 404)
    app.state.tables.users2[1].admin = 1
    app.state.tables.colab[0].demandante = 'other@example.invalid'
    assert.equal((await previous.request('GET', '/registros/1')).status, 200)
})

test('namesakes with different owners never cross record scopes even if author emails suggest otherwise', async t => {
    const app = await harness(t)
    for (const row of app.state.tables.colab) row.colab = 'Homônimo fictício'
    for (const row of app.state.tables.registros) row.colab = 'Homônimo fictício'
    app.state.tables.registros[0].demandante = 'other@example.invalid'
    app.state.tables.registros[1].demandante = email
    const reviewer = app.client(); await reviewer.login()
    for (const url of ['/registros', '/registros2']) {
        assert.deepEqual((await reviewer.request('GET', url)).json().map(row => row.id), [1])
    }
    assert.equal((await reviewer.request('GET', '/registros/2')).status, 404)
})

test('ID selection disambiguates authorized namesakes while legacy ambiguous names return 409 on both write paths', async t => {
    const app = await harness(t)
    app.state.tables.colab.push({ id: 3, colab: 'Profissional A', demandante: email })
    const reviewer = app.client(); await reviewer.login()
    const headers = { 'X-CSRF-Token': await reviewer.csrf() }
    for (const url of ['/registros', '/registros2']) {
        const before = app.state.tables.registros.length
        assert.equal((await reviewer.request('POST', url, validEvaluation(), headers)).status, 409)
        assert.equal(app.state.tables.registros.length, before)
        assert.equal((await reviewer.request('POST', url, validEvaluation({ colab_id: '3', demandante: 'forged@example.invalid' }), headers)).status, 204)
        const saved = app.state.tables.registros.at(-1)
        assert.equal(saved.colab_id, 3)
        assert.equal(saved.colab, 'Profissional A')
        assert.equal(saved.demandante, email)
    }
})

test('legacy names resolve only inside the current scope, while administrators must disambiguate globally', async t => {
    const app = await harness(t)
    app.state.tables.colab[1].colab = 'Profissional A'
    const reviewer = app.client(); await reviewer.login()
    const admin = app.client(); await admin.login('admin@example.invalid')
    for (const url of ['/registros', '/registros2']) {
        assert.equal((await reviewer.request('POST', url, validEvaluation(), { 'X-CSRF-Token': await reviewer.csrf() })).status, 204)
        assert.equal(app.state.tables.registros.at(-1).colab_id, 1)
        const before = app.state.tables.registros.length
        assert.equal((await admin.request('POST', url, validEvaluation(), { 'X-CSRF-Token': await admin.csrf() })).status, 409)
        assert.equal(app.state.tables.registros.length, before)
    }
})

test('invalid, unauthorized, nonexistent and stale ID selections never fall back to a valid name', async t => {
    const app = await harness(t)
    const reviewer = app.client(); await reviewer.login()
    const headers = { 'X-CSRF-Token': await reviewer.csrf() }
    const before = app.state.tables.registros.length
    for (const url of ['/registros', '/registros2']) {
        for (const colab_id of [null, 0, -1, true, [], {}, '01', '1x', 4294967296]) {
            assert.equal((await reviewer.request('POST', url, validEvaluation({ colab_id }), headers)).status, 400)
        }
        for (const colab_id of [2, 4294967295]) {
            assert.equal((await reviewer.request('POST', url, validEvaluation({ colab_id }), headers)).status, 403)
        }
        assert.equal((await reviewer.request('POST', url, validEvaluation({ colab_id: 1, colab: 'Nome desatualizado' }), headers)).status, 409)
    }
    assert.equal(app.state.tables.registros.length, before)
    assert.equal(app.state.writes.length, 0)
})

test('current owner is read from colab on every request, using the existing exact canonical email policy', async t => {
    const app = await harness(t)
    const reviewer = app.client(); await reviewer.login()
    for (const demandante of [email.toUpperCase(), email + ' ', 'missing@example.invalid']) {
        app.state.tables.colab[0].demandante = demandante
        assert.deepEqual((await reviewer.request('GET', '/registros')).json(), [])
        assert.equal((await reviewer.request('GET', '/registros/1')).status, 404)
    }
    app.state.tables.colab[0].demandante = email
    assert.equal((await reviewer.request('GET', '/registros/1')).status, 200)
})

test('MySQL history scope is a parameterized ID subquery applied before pagination, without author/name fallback', async () => {
    const db = knex({ client: 'mysql' })
    db.client.acquireConnection = () => assert.fail('No SQL connection allowed')
    try {
        const query = scopeRecords(db, db('registros').select('id', 'colab_id', 'demandante'), { email, admin: false })
            .orderBy('id').limit(25).offset(25).toSQL()
        assert.match(query.sql, /`colab_id` in \(select `id` from `colab` where BINARY `demandante` = \?\)/)
        assert.ok(query.sql.indexOf('where') < query.sql.indexOf('limit'))
        assert.deepEqual(query.bindings, [email, 25, 25])
        assert.doesNotMatch(query.sql, /`colab` =| or /i)
        assert.doesNotMatch(scopeRecords(db, db('registros'), { admin: true }).toSQL().sql, /where|colab_id/)
        assert.throws(() => scopeRecords(db, db('registros')), /Authentication/)
    } finally { await db.destroy() }
})

test('new migration compiles an additive nullable indexed ID foreign key, without executing SQL or backfilling history', async () => {
    const db = knex({ client: 'mysql' })
    db.client.acquireConnection = () => assert.fail('Migration execution is forbidden')
    try {
        const sql = migration.up(db).toSQL().map(statement => statement.sql).join('\n')
        assert.match(sql, /add `colab_id` int unsigned null/)
        assert.match(sql, /index `registros_colab_id_index`\(`colab_id`\)/)
        assert.match(sql, /foreign key \(`colab_id`\) references `colab` \(`id`\)/)
        assert.match(sql, /on update RESTRICT on delete RESTRICT/i)
        assert.doesNotMatch(sql, /\b(?:drop|update `|delete from|insert into)\b/i)
        await assert.rejects(migration.down(), /backup/)
    } finally { await db.destroy() }
})
