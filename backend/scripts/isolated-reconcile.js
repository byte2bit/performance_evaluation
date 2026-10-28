// One reviewed fictional batch only. Never runs migrations or infers mappings by name.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomBytes } = require('node:crypto')
const { decryptDetails, encryptDetails, collect } = require('./isolated-inventory')
const { recoveryTarget } = require('./isolated-record-links')

const authorizedProfile = '0f8785e640294ebbbd5490d74b01e59a'
const reviewFilename = 'inventory-review-b20980a65853.evalinventory'
const inventoryFilename = 'inventory-c9ef67f5d8ab.evalinventory'
const inventoryDigest = 'd3f4ed32e97244155fbbdb5ee17815beba38e624dea5cc8cd80fe535455e66e0'
const confirmation = 'R01-R08:P01'
const same = (actual, expected) => assert.ok(JSON.stringify(actual) === JSON.stringify(expected), 'Reviewed state mismatch')
const validId = id => Number.isInteger(id) && id > 0 && id <= 4294967295

function reviewedMap(profile, review, inventory, approved) {
    assert.equal(profile.id, authorizedProfile)
    assert.equal(approved, confirmation, 'Explicit reviewed map confirmation required')
    assert.equal(review.sourceArtifact, inventoryFilename)
    assert.equal(review.sourceArtifactSha256, inventoryDigest)
    assert.equal(review.sourceSnapshotUnchanged, true)
    assert.equal(review.approvedForApplication, false) // Original review is immutable; approval is recorded separately.
    assert.equal(review.cases.length, 8)
    const professionals = [...inventory.details.professionals].sort((a, b) => a.id - b.id)
    const records = [...inventory.details.unresolved].sort((a, b) => a.id - b.id)
    assert.equal(professionals.length, 2)
    assert.equal(records.length, 8)
    const map = review.cases.map((row, index) => {
        assert.equal(row.alias, 'R' + String(index + 1).padStart(2, '0'))
        assert.equal(row.decision, 'pending_confirmation')
        assert.equal(row.previousColabId, null)
        assert.equal(row.recordId, records[index].id)
        assert.equal(records[index].colab_id, null)
        assert.equal(row.candidates.length, 1)
        const candidate = row.candidates[0]
        assert.equal(candidate.alias, 'P01')
        assert.equal(candidate.professionalId, professionals[0].id)
        assert.equal(candidate.exactName, true)
        assert.equal(candidate.declaredFixtureTarget, true)
        assert.equal(candidate.assignmentHasIssue, false)
        assert.ok(records[index].candidates.some(item => item.professionalId === candidate.professionalId && item.exactName))
        assert.ok(validId(row.recordId) && validId(candidate.professionalId))
        return { recordId: row.recordId, professionalId: candidate.professionalId }
    })
    assert.equal(new Set(map.map(row => row.recordId)).size, 8)
    assert.equal(new Set(map.map(row => row.professionalId)).size, 1)
    return map
}

async function snapshot(client, name, lock = false) {
    const result = {}
    for (const table of ['users2', 'colab', 'registros']) {
        const [rows] = await client.query('SELECT * FROM ??.?? ORDER BY id LIMIT 10001' +
            (lock ? (table === 'users2' ? ' FOR SHARE' : ' FOR UPDATE') : ''), [name, table])
        assert.ok(rows.length <= 10000)
        result[table] = rows
    }
    return result
}

function mappedSnapshot(before, map) {
    const expected = structuredClone(before)
    const ids = new Set()
    for (const row of map) {
        assert.ok(validId(row.recordId) && validId(row.professionalId) && !ids.has(row.recordId))
        ids.add(row.recordId)
        const record = expected.registros.find(item => item.id === row.recordId)
        assert.ok(record && record.colab_id === null, 'Existing link or missing record')
        assert.ok(expected.colab.some(item => item.id === row.professionalId), 'Missing professional')
        record.colab_id = row.professionalId
    }
    return expected
}

async function applyMap(client, name, before, map, { dryRun = false } = {}) {
    const expected = mappedSnapshot(before, map)
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    await client.beginTransaction()
    try {
        same(await snapshot(client, name, true), before)
        for (const row of [...map].sort((a, b) => a.recordId - b.recordId)) {
            const [result] = await client.query('UPDATE ??.registros SET colab_id = ? WHERE id = ? AND colab_id IS NULL',
                [name, row.professionalId, row.recordId])
            assert.equal(result.affectedRows, 1)
        }
        // Compare every business field before commit, including account hashes and timestamps.
        same(await snapshot(client, name, true), expected)
        if (dryRun) await client.rollback()
        else await client.commit()
        return { updated: map.length, committed: !dryRun }
    } catch (error) {
        await client.rollback()
        throw error
    }
}

async function structure(root, name, expectedMigrations, profileId) {
    const [markers] = await root.query('SELECT profile_id FROM ??.isolation_marker', [name])
    same(markers.map(row => row.profile_id), [profileId])
    const [migrations] = await root.query('SELECT name FROM ??.migrations ORDER BY name', [name])
    assert.equal(expectedMigrations.length, 12)
    same(migrations.map(row => row.name), expectedMigrations)
    const [tables] = await root.query('SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [name])
    assert.ok(tables.length > 0 && tables.every(row => row.engine === 'InnoDB'))
    const [triggers] = await root.query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?', [name])
    assert.equal(triggers.length, 0)
    const [columns] = await root.query('SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [name, 'registros'])
    assert.ok(columns.every(row => !/on update|generated/i.test(row.extra.replace(/DEFAULT_GENERATED/gi, ''))))
    const link = columns.find(row => row.name === 'colab_id')
    assert.ok(link && link.type === 'int unsigned' && link.nullable === 'YES')
    const [foreign] = await root.query('SELECT k.REFERENCED_TABLE_NAME AS parentTable, k.REFERENCED_COLUMN_NAME AS parentColumn, r.DELETE_RULE AS deleteRule, r.UPDATE_RULE AS updateRule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? AND k.CONSTRAINT_NAME = ?', [name, 'registros', 'registros_colab_id_foreign'])
    assert.equal(foreign.length, 1)
    same({ ...foreign[0] }, { parentTable: 'colab', parentColumn: 'id', deleteRule: 'RESTRICT', updateRule: 'RESTRICT' })
}

async function noWriters(root, names) {
    const [connections] = await root.query('SELECT ID FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND DB IN (?, ?)', names)
    assert.equal(connections.length, 0, 'Close source and recovery writers before reconciling')
}

async function httpChecks({ profile, startApplication, browser, before, map, root }) {
    const runtime = await startApplication(profile)
    const ids = map.map(row => row.recordId).sort((a, b) => a - b)
    const clients = []
    const primary = before.colab.find(row => row.id === map[0].professionalId)
    try {
        assert.equal((await browser(runtime).request('GET', '/registros')).status, 401)
        for (const [email, variable] of [['reviewer@example.invalid', 'EVAL_ISOLATED_EVALUATOR_PASSWORD'], ['admin@example.invalid', 'EVAL_ISOLATED_ADMIN_PASSWORD']]) {
            const client = browser(runtime); clients.push(client)
            assert.equal((await client.login(email, process.env[variable])).status, 200)
            for (const url of ['/registros', '/registros2?page=1&limit=100']) {
                const response = await client.request('GET', url)
                assert.equal(response.status, 200)
                same(response.json().map(row => row.id).sort((a, b) => a - b), ids)
            }
            const paged = []
            for (let page = 1; page <= 3; page++) {
                const response = await client.request('GET', '/registros2?page=' + page + '&limit=3')
                assert.equal(response.status, 200); paged.push(...response.json().map(row => row.id))
            }
            same(paged.sort((a, b) => a - b), ids)
            for (const id of ids) {
                const response = await client.request('GET', '/registros/' + id)
                assert.equal(response.status, 200)
                const row = response.json(), original = before.registros.find(item => item.id === id)
                assert.equal(row.colab_id, primary.id)
                assert.equal(row.demandante, original.demandante)
                assert.equal(row.created_at, new Date(original.created_at).toISOString())
                assert.equal(row.updated_at, new Date(original.updated_at).toISOString())
            }
            assert.equal((await client.request('GET', '/registros/4294967295')).status, 404)
        }
        // Copy only: existing reviewer session must lose access on the next request.
        await root.query('UPDATE ??.colab SET demandante = ? WHERE id = ?', [profile.database, 'admin@example.invalid', primary.id])
        try {
            same((await clients[0].request('GET', '/registros')).json(), [])
            same((await clients[0].request('GET', '/registros2?page=1&limit=100')).json(), [])
            for (const id of ids) assert.equal((await clients[0].request('GET', '/registros/' + id)).status, 404)
            assert.equal((await clients[1].request('GET', '/registros')).json().length, ids.length)
        } finally {
            await root.query('UPDATE ??.colab SET demandante = ? WHERE id = ?', [profile.database, primary.demandante, primary.id])
        }
        for (const client of clients) assert.equal((await client.request('POST', '/signout', {}, await client.csrf())).status, 204)
        return { anonymousDenied: true, currentEvaluatorAndAdminReadEight: true, paginationAndIds: true,
            authorsAndTimestampsPreserved: true, existingSessionLosesTransferredHistory: true }
    } finally { await runtime.close() }
}

async function waitForLock(root, name, finished) {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
        const [[row]] = await root.query('SELECT COUNT(*) AS count FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE = w.ENGINE WHERE l.OBJECT_SCHEMA = ? AND l.OBJECT_NAME = ?', [name, 'colab'])
        if (Number(row.count) > 0) return
        assert.equal(finished(), false)
        await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Copy lock wait not observed')
}

async function reconcile({ profile, root, verifyServer, connectApplication, startApplication, browser,
    reviewReportName, recoveryReportName, confirmedMap, secret, progress = () => {} }) {
    const state = { sourceCommitted: false, copyCommitted: false }
    const version = await verifyServer(root, profile)
    assert.equal(reviewReportName, reviewFilename)
    assert.equal(profile.id, authorizedProfile)
    assert.equal(confirmedMap, confirmation)
    const review = decryptDetails(JSON.parse(fs.readFileSync(path.join(profile.directory, reviewFilename), 'utf8')),
        secret, profile.id + ':' + profile.database + ':review:b20980a65853', profile.id)
    const originalBytes = fs.readFileSync(path.join(profile.directory, inventoryFilename))
    assert.equal(createHash('sha256').update(originalBytes).digest('hex'), inventoryDigest)
    const original = decryptDetails(JSON.parse(originalBytes), secret, profile.id + ':' + profile.database + ':c9ef67f5d8ab', profile.id)
    const map = reviewedMap(profile, review, original, confirmedMap)
    assert.match(recoveryReportName || '', /^recovery-report-[a-f0-9]{12}\.json$/)
    const backup = JSON.parse(fs.readFileSync(path.join(profile.directory, recoveryReportName), 'utf8'))
    const target = recoveryTarget(profile, backup, recoveryReportName)
    assert.ok(Date.parse(backup.completedUtc) > Date.parse(review.completedUtc), 'A new verified backup is required')
    assert.ok(fs.existsSync(path.join(profile.directory, backup.encryptedArtifact)))
    const expectedMigrations = fs.readdirSync(path.join(__dirname, '../migrations')).filter(name => /^\d+_.*\.js$/.test(name)).sort()
    await noWriters(root, [profile.database, target.name])
    for (const name of [profile.database, target.name]) await structure(root, name, expectedMigrations, profile.id)
    const inspection = await connectApplication(profile)
    try {
        const current = await collect({ client: inspection, profile, verifyServer, expectedMigrations })
        same(current.details, original.details); same(current.counts, original.counts)
    } finally { await inspection.end() }
    const before = await snapshot(root, profile.database)
    same(await snapshot(root, target.name), before)
    const expected = mappedSnapshot(before, map)
    const batchId = randomBytes(6).toString('hex')
    const manifestName = 'reconcile-manifest-' + batchId + '.evalinventory'
    const manifest = encryptDetails({ approvedMap: confirmedMap, reviewReportName, recoveryReportName,
        sourceArtifactSha256: inventoryDigest, map, before, approvedForApplication: true, recordedUtc: new Date().toISOString() },
    secret, profile.id + ':' + profile.database + ':reconcile:' + batchId, profile.id)
    fs.writeFileSync(path.join(profile.directory, manifestName), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 })
    const reportName = 'reconcile-report-' + batchId + '.json'
    const checkpoint = phase => {
        const report = { batchId, phase, ...state, manifestName, recoveryReportName, updatedUtc: new Date().toISOString() }
        fs.writeFileSync(path.join(profile.directory, reportName), JSON.stringify(report), { flag: phase === 'prepared' ? 'wx' : 'w' })
        progress(phase)
    }
    checkpoint('prepared')
    let copy, blocker, pending
    try {
        const copyProfile = { ...profile, database: target.name }
        copy = await connectApplication(copyProfile)
        await verifyServer(copy, profile)
        checkpoint('copy-rollback-probe')
        same(await applyMap(copy, target.name, before, map, { dryRun: true }), { updated: 8, committed: false })
        same(await snapshot(root, target.name), before)
        checkpoint('copy-concurrent-application')
        blocker = await connectApplication(copyProfile)
        await blocker.beginTransaction()
        await blocker.query('SELECT id FROM ??.colab WHERE id = ? FOR UPDATE', [target.name, map[0].professionalId])
        let finished = false
        pending = applyMap(copy, target.name, before, map).then(value => { finished = true; return { value } }, error => { finished = true; return { error } })
        await waitForLock(root, target.name, () => finished)
        await blocker.rollback(); await blocker.end(); blocker = null
        const outcome = await pending; pending = null
        if (outcome.error) throw outcome.error
        state.copyCommitted = true
        same(await snapshot(root, target.name), expected)
        await assert.rejects(applyMap(copy, target.name, before, map))
        same(await snapshot(root, target.name), expected)
        await copy.end(); copy = null
        checkpoint('copy-http-validation')
        const http = await httpChecks({ profile: copyProfile, startApplication, browser, before, map, root })
        same(await snapshot(root, target.name), expected)
        same(await snapshot(root, profile.database), before)
        checkpoint('source-preconditions')
        await noWriters(root, [profile.database, target.name])
        await structure(root, profile.database, expectedMigrations, profile.id)
        const source = await connectApplication(profile)
        try {
            await verifyServer(source, profile)
            checkpoint('source-transaction')
            await applyMap(source, profile.database, before, map)
            state.sourceCommitted = true
        } finally { await source.end() }
        checkpoint('source-verification')
        same(await snapshot(root, profile.database), expected)
        const report = { success: true, ...state, completedUtc: new Date().toISOString(), mysqlVersion: version,
            migrationCount: 12, updatedRecords: 8, map: confirmation, backup, manifestName,
            copyRollbackVerified: true, copyLockWaitObserved: true, replayRejected: true, http,
            otherBusinessFieldsPreserved: true, accountsAndProfessionalsPreserved: true,
            smtpDelivery: false, automaticBackfill: false }
        fs.writeFileSync(path.join(profile.directory, reportName), JSON.stringify(report, null, 2))
        return report
    } catch (error) {
        if (blocker) { await blocker.rollback().catch(() => {}); await blocker.end(); blocker = null }
        if (pending) {
            const outcome = await pending; pending = null
            if (outcome.value?.committed) state.copyCommitted = true
        }
        checkpoint('failed')
        // Never relay SQL, assertion contents, hashes or row data.
        throw Object.assign(new Error('Reviewed reconciliation failed'), { code: 'RECONCILE_FAILED' })
    } finally {
        if (blocker) { await blocker.rollback().catch(() => {}); await blocker.end() }
        if (pending) await pending
        if (copy) await copy.end()
    }
}

module.exports = { reviewedMap, mappedSnapshot, applyMap, reconcile, structure }
