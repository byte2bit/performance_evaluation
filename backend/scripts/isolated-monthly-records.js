// Opt-in SQL/HTTP validation. Source is read-only; all fixtures target a fresh,
// explicitly confirmed recovery copy. Never imports production bootstrap or .env.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { recover } = require('./isolated-recovery')
const { assertStructure, assertNoWriters } = require('./isolated-required-department')
const { monthlyRecordQuery, monthBounds, recordingClockSql } = require('../lib/records')

const confirmationText = 'records:monthly:copy-only:baseline14'
function approvedTarget(profile, confirmation, copyId) {
    assert.equal(profile.id, '0f8785e640294ebbbd5490d74b01e59a')
    assert.equal(profile.database, 'evaluation_isolated_0f8785e64029_v2')
    assert.equal(profile.host, '127.0.0.1')
    assert.equal(profile.port, 50470)
    assert.equal(confirmation, confirmationText)
    assert.match(copyId || '', /^[a-f0-9]{12}$/)
    return profile.database + '_restore_' + copyId
}

async function businessSnapshot(root, name) {
    const result = {}
    for (const table of ['users2', 'gerencias', 'colab', 'registros']) {
        const [rows] = await root.query('SELECT * FROM ??.?? ORDER BY id LIMIT 10001', [name, table])
        assert.ok(rows.length <= 10000)
        result[table] = createHash('sha256').update(JSON.stringify(rows)).digest('hex')
    }
    return result
}

async function waitForTwoWriters(root, target, settled, { timeout = 3000, pause = () => new Promise(resolve => setTimeout(resolve, 40)) } = {}) {
    const deadline = Date.now() + timeout
    do {
        const [[row]] = await root.query('SELECT COUNT(*) AS count FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE = w.ENGINE WHERE l.OBJECT_SCHEMA = ? AND l.OBJECT_NAME = ?', [target, 'colab'])
        assert.equal(settled(), false, 'Both submissions must still be waiting')
        if (Number(row.count) >= 2) return
        await pause()
    } while (Date.now() < deadline)
    throw Object.assign(new Error('Two SQL lock waits were not observed'), { code: 'MONTHLY_LOCK_WAITS_NOT_OBSERVED' })
}

function evaluation(colab, colab_id) {
    return { colab, colab_id, avaliacao: '5', nivel: 'A', desconto: '0%', nota_qualidade: '5', obs_qualidade: '',
        nota_prazo: '5', obs_prazo: '', nota_dispon: '5', obs_dispon: '', nota_respon: '5', obs_respon: '',
        itensQualidade: '', itensDispon: '', liderancas: null }
}

async function exerciseCopy({ profile, root, startApplication, browser, copyId }) {
    const runtime = await startApplication(profile)
    const clients = [], pending = []
    let blocker
    try {
        const db = runtime.db
        assert.equal(db.client.config.connection.database, profile.database)
        const admin = browser(runtime), reviewer = browser(runtime)
        clients.push(admin, reviewer)
        assert.equal((await admin.login('admin@example.invalid', process.env.EVAL_ISOLATED_ADMIN_PASSWORD)).status, 200)
        assert.equal((await reviewer.login('reviewer@example.invalid', process.env.EVAL_ISOLATED_EVALUATOR_PASSWORD)).status, 200)
        for (const client of clients) client.token = await client.csrf()
        const adminAccount = await db('users2').where({ email: 'admin@example.invalid' }).first()
        const reviewerAccount = await db('users2').where({ email: 'reviewer@example.invalid' }).first()
        assert.ok(adminAccount && reviewerAccount && adminAccount.admin && !reviewerAccount.admin)
        const [departmentId] = await db('gerencias').insert({ nome: 'Teste mensal ' + copyId, demandante_id: reviewerAccount.id })
        const sameName = 'Homônimo mensal fictício ' + copyId
        const ids = []
        for (const name of [sameName, sameName, 'Limites mensais fictícios ' + copyId]) {
            const [id] = await db('colab').insert({ colab: name, gerencia_id: departmentId, demandante: reviewerAccount.email })
            ids.push(id)
        }
        const data = evaluation(sameName, ids[0])
        blocker = await db.transaction()
        await blocker('colab').where({ id: ids[0] }).forUpdate().first()
        let settled = false
        for (const [client, endpoint] of [[reviewer, '/registros'], [admin, '/registros2']]) {
            const request = client.request('POST', endpoint, data, client.token).then(result => { settled = true; return result })
            request.catch(() => {})
            pending.push(request)
        }
        await waitForTwoWriters(root, profile.database, () => settled)
        await blocker.rollback(); blocker = null
        const replies = await Promise.all(pending)
        assert.deepEqual(replies.map(reply => reply.status).sort(), [204, 409])
        assert.equal(replies.find(reply => reply.status === 409).text, 'Este profissional já possui uma avaliação neste mês.')
        const rows = await db('registros').where({ colab_id: ids[0] })
        assert.equal(rows.length, 1)
        assert.equal(rows[0].demandante, replies[0].status === 204 ? reviewerAccount.email : adminAccount.email)
        const [[clock]] = await db.raw(recordingClockSql)
        const [[saved]] = await db.raw("SELECT DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS recorded_at FROM registros WHERE id = ?", [rows[0].id])
        const bounds = monthBounds(clock.recorded_at)
        assert.ok(saved.recorded_at >= bounds.start && saved.recorded_at < bounds.end)
        for (const client of clients) for (const endpoint of ['/registros', '/registros2']) {
            assert.equal((await client.request('POST', endpoint, { ...data, created_at: '2000-01-01 00:00:00' }, client.token)).status, 409)
        }
        assert.equal((await reviewer.request('POST', '/registros2', evaluation(sameName, ids[1]), reviewer.token)).status, 204)
        const authors = await db('registros').whereIn('colab_id', ids.slice(0, 2)).orderBy('id')
        await db('gerencias').where({ id: departmentId }).update({ demandante_id: adminAccount.id })
        assert.equal((await reviewer.request('POST', '/registros', data, reviewer.token)).status, 403)
        assert.equal((await admin.request('POST', '/registros2', data, admin.token)).status, 409)
        assert.deepEqual(await db('registros').whereIn('colab_id', ids.slice(0, 2)).orderBy('id'), authors)

        // Date boundaries execute real SQL against fixtures in the copy, without
        // changing the server/session clock or inventing HTTP recording dates.
        const boundary = evaluation('Limites mensais fictícios ' + copyId, ids[2])
        await db('registros').insert({ ...boundary, demandante: adminAccount.email, created_at: '2026-12-31 23:59:59' })
        assert.ok(await monthlyRecordQuery(db, ids[2], '2026-12-01 00:00:00'))
        assert.equal(await monthlyRecordQuery(db, ids[2], '2027-01-01 00:00:00'), undefined)
        await db('registros').insert({ ...boundary, demandante: adminAccount.email, created_at: '2027-01-01 00:00:00' })
        assert.ok(await monthlyRecordQuery(db, ids[2], '2027-01-31 23:59:59'))
        assert.equal(await monthlyRecordQuery(db, ids[2], '2027-02-01 00:00:00'), undefined)
        await db('registros').insert({ ...boundary, demandante: adminAccount.email, created_at: '2028-02-29 00:00:00' })
        assert.ok(await monthlyRecordQuery(db, ids[2], '2028-02-01 00:00:00'))
        assert.equal(await monthlyRecordQuery(db, ids[2], '2028-03-01 00:00:00'), undefined)
        const [[timezone]] = await db.raw('SELECT @@session.time_zone AS sessionTimezone, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), CURRENT_TIMESTAMP()) AS offsetMinutes')
        return { concurrentHttpStatuses: replies.map(reply => reply.status).sort(), twoInnoDbWaitsObserved: true,
            exactlyOneConcurrentInsert: true, sessionAuthorPreserved: true, storedDateInDatabaseMonth: true,
            bothEndpointsRejectDuplicates: true, clientTimestampIgnored: true, namesakesRemainIndependent: true,
            transferPreservesAuthorsAndMonthlyLimit: true, sqlMonthYearAndLeapBoundaries: true,
            sessionTimezone: timezone.sessionTimezone, utcOffsetMinutes: Number(timezone.offsetMinutes) }
    } finally {
        if (blocker && !blocker.isCompleted()) await blocker.rollback()
        await Promise.allSettled(pending)
        for (const client of clients) await client.request('POST', '/signout', {}, client.token).catch(() => {})
        await runtime.close()
    }
}

async function validate({ profile, root, verifyServer, startApplication, browser, confirmation, copyId,
    recovery = recover, structure = assertStructure, writers = assertNoWriters, progress = () => {} }) {
    const target = approvedTarget(profile, confirmation, copyId)
    await verifyServer(root, profile)
    await structure(root, profile.database, 14, profile.id)
    await writers(root, [profile.database])
    const before = await businessSnapshot(root, profile.database)
    progress('backup-restore')
    const recovered = await recovery({ profile, root, startApplication, browser, backupId: copyId })
    assert.equal(recovered.success, true)
    assert.equal(recovered.sourceUnchanged, true)
    assert.equal(recovered.ddlAndContentsMatch, true)
    assert.equal(recovered.restoredDatabase, target)
    await structure(root, target, 14, profile.id)
    progress('copy-sql-http')
    const checks = await exerciseCopy({ profile: { ...profile, database: target }, root, startApplication, browser, copyId })
    assert.deepEqual(await businessSnapshot(root, profile.database), before, 'Source business data must remain intact')
    const report = { success: true, sourceDatabase: profile.database, copyDatabase: target, sourceBusinessUnchanged: true,
        recoveryReport: 'recovery-report-' + copyId + '.json', migrationsExecuted: 0, copyPreserved: true,
        checks, completedUtc: new Date().toISOString() }
    fs.writeFileSync(path.join(profile.directory, 'monthly-records-report-' + copyId + '.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
    return report
}

module.exports = { validate, approvedTarget, waitForTwoWriters, confirmationText }
