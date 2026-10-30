const assert = require('node:assert/strict')
const test = require('node:test')
const knex = require('knex')
const { harness } = require('./helpers/auth-harness')
const { validEvaluation } = require('./helpers/evaluation-fixture')
const { monthBounds, monthlyRecordQuery, recordingClockSql } = require('../lib/records')

test('monthly ranges include the first instant and exclude the next month, including leap years and December', () => {
    assert.deepEqual(monthBounds('2026-12-31 23:59:59'), { start: '2026-12-01 00:00:00', end: '2027-01-01 00:00:00' })
    assert.deepEqual(monthBounds('2028-02-29 12:30:00'), { start: '2028-02-01 00:00:00', end: '2028-03-01 00:00:00' })
    for (const value of [null, new Date(), 'synthetic', '2026-00-01 00:00:00', '2026-13-01 00:00:00']) assert.throws(() => monthBounds(value))
})

test('monthly lookup compiles parameterized professional/date bounds without author or name matching', async () => {
    const db = knex({ client: 'mysql' })
    db.client.acquireConnection = () => assert.fail('No real SQL connection allowed')
    try {
        const query = monthlyRecordQuery(db, 7, '2026-12-31 23:59:59').toSQL()
        assert.match(query.sql, /`colab_id` = \? and `created_at` >= \? and `created_at` < \?/)
        assert.deepEqual(query.bindings, [7, '2026-12-01 00:00:00', '2027-01-01 00:00:00', 1])
        assert.doesNotMatch(query.sql, /demandante|`colab`|date_format/i)
    } finally { await db.destroy() }
})

test('both write routes reject another evaluation in the same month even from an administrator', async t => {
    const app = await harness(t), reviewer = app.client(), admin = app.client()
    await reviewer.login(); await admin.login('admin@example.invalid')
    const reviewerHeaders = { 'X-CSRF-Token': await reviewer.csrf() }
    const adminHeaders = { 'X-CSRF-Token': await admin.csrf() }
    app.state.recordedAt = '2026-10-01 00:00:00'
    assert.equal((await reviewer.request('POST', '/registros', validEvaluation({ colab_id: 1 }), reviewerHeaders)).status, 204)
    const before = structuredClone(app.state.tables.registros)
    app.state.recordedAt = '2026-10-31 23:59:59'
    for (const client of [reviewer, admin]) for (const url of ['/registros', '/registros2']) {
        const result = await client.request('POST', url, validEvaluation({ colab_id: 1 }), client === reviewer ? reviewerHeaders : adminHeaders)
        assert.equal(result.status, 409)
        assert.equal(result.text, 'Este profissional já possui uma avaliação neste mês.')
    }
    assert.deepEqual(app.state.tables.registros, before)
    app.state.recordedAt = '2026-11-01 00:00:00'
    assert.equal((await reviewer.request('POST', '/registros2', validEvaluation({ colab_id: 1, created_at: '2026-10-01 00:00:00' }), reviewerHeaders)).status, 204)
    assert.equal(app.state.tables.registros.at(-1).created_at, '2026-11-01 00:00:00')
    assert.ok(app.state.transactionOptions.every(option => option.isolationLevel === 'read committed'))
})

test('professional ID separates namesakes and monthly blocking survives a change of current owner', async t => {
    const app = await harness(t), admin = app.client(), current = app.client()
    await admin.login('admin@example.invalid'); await current.login('other@example.invalid')
    app.state.tables.colab[1].colab = 'Profissional A'
    const headers = { 'X-CSRF-Token': await admin.csrf() }
    for (const colab_id of [1, 2]) assert.equal((await admin.request('POST', '/registros', validEvaluation({ colab_id }), headers)).status, 204)
    app.state.tables.gerencias[0].demandante_id = 3
    const result = await current.request('POST', '/registros2', validEvaluation({ colab_id: 1 }), { 'X-CSRF-Token': await current.csrf() })
    assert.equal(result.status, 409)
    assert.equal(app.state.tables.registros.filter(row => row.created_at === app.state.recordedAt).length, 2)
})

test('monthly blocking preserves legacy duplicates and checks authorization before disclosing a monthly conflict', async t => {
    const app = await harness(t), reviewer = app.client()
    await reviewer.login()
    for (const row of app.state.tables.registros) row.created_at = '2026-10-10 12:00:00'
    app.state.tables.registros.push({ ...app.state.tables.registros[0], id: 3 })
    const before = structuredClone(app.state.tables.registros)
    const headers = { 'X-CSRF-Token': await reviewer.csrf() }
    assert.equal((await reviewer.request('POST', '/registros', validEvaluation({ colab_id: 1 }), headers)).status, 409)
    assert.equal((await reviewer.request('POST', '/registros', validEvaluation({ colab_id: 2, colab: 'Profissional B' }), headers)).status, 403)
    assert.deepEqual(app.state.tables.registros, before)
})

test('simultaneous requests on both routes wait for the exclusive professional lock in the memory fixture', async t => {
    const app = await harness(t), first = app.client(), second = app.client()
    await first.login(); await second.login('admin@example.invalid')
    const firstHeaders = { 'X-CSRF-Token': await first.csrf() }, secondHeaders = { 'X-CSRF-Token': await second.csrf() }
    let enterClock, releaseClock, calls = 0
    const clockEntered = new Promise(resolve => { enterClock = resolve })
    const clockGate = new Promise(resolve => { releaseClock = resolve })
    let enterSecondLock, attempts = 0
    const secondLockRequested = new Promise(resolve => { enterSecondLock = resolve })
    app.state.onProfessionalLock = () => { if (++attempts === 2) enterSecondLock() }
    t.after(() => releaseClock())
    const raw = app.db.raw
    app.db.raw = async sql => {
        assert.equal(sql, recordingClockSql)
        if (++calls === 1) { enterClock(); await clockGate }
        return raw(sql)
    }
    const one = first.request('POST', '/registros', validEvaluation({ colab_id: 1 }), firstHeaders)
    await clockEntered
    const two = second.request('POST', '/registros2', validEvaluation({ colab_id: 1 }), secondHeaders)
    await secondLockRequested
    assert.equal(calls, 1, 'The second transaction cannot read the clock or check duplicates before the first releases its lock')
    releaseClock()
    const responses = await Promise.all([one, two])
    assert.deepEqual(responses.map(response => response.status), [204, 409])
    assert.equal(app.state.tables.registros.filter(row => row.created_at === app.state.recordedAt).length, 1)
    assert.deepEqual(app.state.lockEvents, [
        { action: 'acquire', id: 1 }, { action: 'release', id: 1 },
        { action: 'acquire', id: 1 }, { action: 'release', id: 1 }
    ])
})

test('the captured database date is also persisted when wall-clock time moves into the next month', async t => {
    const app = await harness(t), reviewer = app.client()
    await reviewer.login()
    app.state.recordedAt = '2026-12-31 23:59:59'
    const raw = app.db.raw
    app.db.raw = async sql => {
        const captured = await raw(sql)
        app.state.recordedAt = '2027-01-01 00:00:00'
        return captured
    }
    assert.equal((await reviewer.request('POST', '/registros', validEvaluation({ colab_id: 1 }), { 'X-CSRF-Token': await reviewer.csrf() })).status, 204)
    assert.equal(app.state.tables.registros.at(-1).created_at, '2026-12-31 23:59:59')
})
