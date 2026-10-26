// Opt-in SQL validation. Only the already-verified external fictitious profile
// and its verified recovery copy are allowed; never loads .env or index.js.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')

const migrationName = '20261026000100_link_registros_to_colab_id.js'
const reviewerEmail = 'reviewer@example.invalid'
const adminEmail = 'admin@example.invalid'

function recoveryTarget(profile, report, filename) {
    const match = /^recovery-report-([a-f0-9]{12})\.json$/.exec(filename || '')
    assert.ok(match, 'Explicit protected recovery report required')
    const id = match[1]
    assert.equal(report.success, true)
    assert.equal(report.sourceDatabase, profile.database)
    assert.equal(report.restoredDatabase, profile.database + '_restore_' + id)
    assert.equal(report.encryptedArtifact, 'backup-' + id + '.evalbackup')
    assert.equal(report.ddlAndContentsMatch, true)
    assert.equal(report.sourceUnchanged, true)
    assert.equal(report.recoveredAdminAndEvaluatorLogin, true)
    return { id, name: report.restoredDatabase }
}

async function applyOnlyLinkMigration(db) {
    const directory = path.resolve(__dirname, '../migrations')
    const files = fs.readdirSync(directory).filter(file => /^\d+_.*\.js$/.test(file)).sort()
    const source = { async getMigrations() { return files }, getMigrationName(file) { return file },
        getMigration(file) { return require(path.join(directory, file)) } }
    const options = { migrationSource: source, tableName: 'migrations' }
    const [completed, pending] = await db.migrate.list(options)
    assert.equal(completed.length, 11, 'Expected the previously validated chain')
    assert.deepEqual(pending.map(item => item.file || item.name || item), [migrationName], 'No other migration may run')
    const started = Date.now()
    const [, applied] = await db.migrate.latest(options)
    assert.deepEqual(applied, [migrationName])
    const [after, remaining] = await db.migrate.list(options)
    assert.equal(after.length, 12)
    assert.equal(remaining.length, 0)
    return { applied: migrationName, migrationCount: after.length, elapsedMs: Date.now() - started }
}

async function businessSnapshot(root, name) {
    const result = {}
    for (const table of ['users2', 'colab', 'registros']) {
        const [rows] = await root.query('SELECT * FROM ??.?? ORDER BY id', [name, table])
        result[table] = rows
    }
    return result
}

function assertPreserved(before, after) {
    assert.deepEqual(after.users2, before.users2)
    assert.deepEqual(after.colab, before.colab)
    assert.deepEqual(after.registros.map(({ colab_id, ...row }) => row), before.registros)
    assert.ok(after.registros.every(row => row.colab_id === null), 'No automatic history mapping allowed')
}

async function metadata(root, name) {
    const [[column]] = await root.query('SELECT COLUMN_TYPE AS type, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', [name, 'registros', 'colab_id'])
    assert.equal(column.type, 'int unsigned'); assert.equal(column.nullable, 'YES')
    const [indexes] = await root.query('SELECT COLUMN_NAME AS columnName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?', [name, 'registros', 'registros_colab_id_index'])
    assert.deepEqual(indexes.map(row => row.columnName), ['colab_id'])
    const [[foreign]] = await root.query('SELECT k.REFERENCED_TABLE_NAME AS parentTable, k.REFERENCED_COLUMN_NAME AS parentColumn, r.DELETE_RULE AS deleteRule, r.UPDATE_RULE AS updateRule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? AND k.CONSTRAINT_NAME = ?', [name, 'registros', 'registros_colab_id_foreign'])
    assert.deepEqual({ ...foreign }, { parentTable: 'colab', parentColumn: 'id', deleteRule: 'RESTRICT', updateRule: 'RESTRICT' })
    const [columns] = await root.query('SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND ((TABLE_NAME = ? AND COLUMN_NAME IN (?, ?)) OR (TABLE_NAME = ? AND COLUMN_NAME IN (?, ?))) ORDER BY TABLE_NAME, COLUMN_NAME', [name, 'colab', 'colab', 'demandante', 'registros', 'colab', 'demandante'])
    return { nullableUnsignedId: true, indexed: true, foreignKeyRestrictive: true, collations: columns }
}

function evaluation(name, id) {
    return { colab: name, ...(id === undefined ? {} : { colab_id: id }), avaliacao: '5', nivel: 'A', desconto: '0%',
        nota_qualidade: '5', obs_qualidade: '', nota_prazo: '5', obs_prazo: '',
        nota_dispon: '5', obs_dispon: '', nota_respon: '5', obs_respon: '', itensQualidade: '', itensDispon: '' }
}

async function waitForLock(root, name, settled) {
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
        const [[row]] = await root.query('SELECT COUNT(*) AS count FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE = w.ENGINE WHERE l.OBJECT_SCHEMA = ? AND l.OBJECT_NAME = ?', [name, 'colab'])
        if (Number(row.count) > 0) return
        assert.equal(settled(), false, 'Write must wait for the pending assignment change')
        await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('ISOLATED_LOCK_WAIT_NOT_OBSERVED')
}

async function expectSqlFailure(operation, errno) {
    const accepted = Array.isArray(errno) ? errno : [errno]
    try { await operation() } catch (error) {
        if (accepted.includes(error.errno)) return
        const code = /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : error.name || 'UNKNOWN'
        throw Object.assign(new Error('Unexpected fixture SQL rejection'), { code: 'LINKS_EXPECTED_' + accepted.join('_') + '_' + code })
    }
    throw Object.assign(new Error('Expected SQL rejection was not enforced'), { code: 'LINKS_EXPECTED_SQL_REJECTION' })
}

async function ownershipChecks({ profile, root, startApplication, browser, originalIds }) {
    const currentEmail = 'current.' + profile.database.slice(-12) + '@example.invalid'
    const runtime = await startApplication(profile)
    const db = runtime.db
    const clients = []
    try {
        const accounts = require('../lib/auth/accounts').createAccounts(db)
        assert.equal(await db('users2').where({ email: currentEmail }).first(), undefined)
        await accounts.create({ name: 'Demandante fictício atual', email: currentEmail,
            password: process.env.EVAL_ISOLATED_EVALUATOR_PASSWORD, admin: false })
        // Only expire the test clients' synthetic counters on this recovery copy.
        const digest = value => createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET).update(JSON.stringify(value)).digest('hex')
        const keys = ['csrf-ip:' + digest('127.0.0.1'), 'signin-ip:' + digest('127.0.0.1'),
            ...[reviewerEmail, currentEmail, adminEmail].map(email => 'signin-pair:' + digest(['127.0.0.1', email]))]
        await db('auth_rate_limits').whereIn('key', keys).update({ expire: 0 })
        const previous = browser(runtime), current = browser(runtime), admin = browser(runtime)
        clients.push(previous, current, admin)
        for (const [client, email, variable] of [[previous, reviewerEmail, 'EVAL_ISOLATED_EVALUATOR_PASSWORD'],
            [current, currentEmail, 'EVAL_ISOLATED_EVALUATOR_PASSWORD'], [admin, adminEmail, 'EVAL_ISOLATED_ADMIN_PASSWORD']]) {
            assert.equal((await client.login(email, process.env[variable])).status, 200)
            client.token = await client.csrf()
        }
        const suffix = profile.database.slice(-12)
        const name = 'Profissional vínculo fictício ' + suffix
        const [first] = await db('colab').insert({ colab: name, demandante: reviewerEmail, matricula: 'VINC-1' })
        const [second] = await db('colab').insert({ colab: name, demandante: reviewerEmail, matricula: 'VINC-2' })
        const [outside] = await db('colab').insert({ colab: name, demandante: currentEmail, matricula: 'VINC-3' })
        const [legacy] = await db('registros').insert({ ...evaluation(name), demandante: reviewerEmail })
        const initialCount = Number((await db('registros').count('* as count'))[0].count)
        const linked = []
        for (const endpoint of ['/registros', '/registros2']) {
            assert.equal((await previous.request('POST', endpoint, evaluation(name), previous.token)).status, 409)
            assert.equal((await previous.request('POST', endpoint, evaluation(name, outside), previous.token)).status, 403)
            assert.equal((await previous.request('POST', endpoint, evaluation('Nome desatualizado', first), previous.token)).status, 409)
            assert.equal((await previous.request('POST', endpoint, evaluation(name, 0), previous.token)).status, 400)
            assert.equal(Number((await db('registros').count('* as count'))[0].count), initialCount + linked.length)
            assert.equal((await previous.request('POST', endpoint, { ...evaluation(name, first), demandante: currentEmail }, previous.token)).status, 204)
            const row = await db('registros').where({ colab_id: first }).orderBy('id', 'desc').first()
            assert.equal(row.demandante, reviewerEmail); linked.push(row.id)
        }
        assert.equal((await previous.request('POST', '/registros', evaluation(name, second), previous.token)).status, 204)
        const secondRecord = await db('registros').where({ colab_id: second }).first()
        assert.equal((await admin.request('POST', '/registros', evaluation(name, first), admin.token)).status, 204)
        const adminRecord = await db('registros').where({ colab_id: first, demandante: adminEmail }).first()
        linked.push(adminRecord.id)
        const beforeTransfer = await db('registros').whereIn('id', linked).orderBy('id')
        await db('colab').where({ id: first }).update({ demandante: currentEmail })
        for (const id of linked) {
            assert.equal((await previous.request('GET', '/registros/' + id)).status, 404)
            assert.equal((await current.request('GET', '/registros/' + id)).status, 200)
            assert.equal((await admin.request('GET', '/registros/' + id)).status, 200)
        }
        for (const endpoint of ['/registros', '/registros2?limit=100']) {
            const previousRows = (await previous.request('GET', endpoint)).json()
            const currentRows = (await current.request('GET', endpoint)).json()
            assert.ok(linked.every(id => !previousRows.some(row => row.id === id) && currentRows.some(row => row.id === id)))
            assert.ok(previousRows.some(row => row.id === secondRecord.id))
            assert.ok(!currentRows.some(row => row.id === secondRecord.id))
            assert.ok([...previousRows, ...currentRows].every(row => row.id !== legacy && !originalIds.includes(row.id)))
        }
        assert.equal((await previous.request('GET', '/registros/' + legacy)).status, 404)
        assert.equal((await current.request('GET', '/registros/' + legacy)).status, 404)
        assert.equal((await admin.request('GET', '/registros/' + legacy)).status, 200)
        assert.deepEqual(await db('registros').whereIn('id', linked).orderBy('id'), beforeTransfer)
        const paged = (await current.request('GET', '/registros2?page=1&limit=1')).json()
        assert.equal(paged.length, 1); assert.equal(paged[0].colab_id, first)

        await expectSqlFailure(() => db('registros').insert({ ...evaluation(name, 4294967295), demandante: reviewerEmail }), [1216, 1452])
        await expectSqlFailure(() => db('colab').where({ id: first }).del(), [1217, 1451])

        await db('colab').where({ id: second }).update({ demandante: reviewerEmail.toUpperCase() })
        assert.equal((await previous.request('GET', '/registros/' + secondRecord.id)).status, 404)
        await db('colab').where({ id: second }).update({ demandante: reviewerEmail })
        assert.equal((await previous.request('GET', '/registros/' + secondRecord.id)).status, 200)
        const accentNames = ['Fictício José ' + suffix, 'Fictício Jose ' + suffix]
        const accentIds = []
        for (const colab of accentNames) accentIds.push((await db('colab').insert({ colab, demandante: reviewerEmail }))[0])
        assert.equal((await previous.request('POST', '/registros', evaluation(accentNames[0]), previous.token)).status, 409)
        assert.equal((await previous.request('POST', '/registros', evaluation(accentNames[0], accentIds[0]), previous.token)).status, 204)

        const uniqueName = 'Profissional concorrência fictício ' + suffix
        const [uniqueId] = await db('colab').insert({ colab: uniqueName, demandante: reviewerEmail })
        assert.equal((await previous.request('POST', '/registros', evaluation(uniqueName), previous.token)).status, 204)
        const transfer = await db.transaction()
        let pending
        try {
            await transfer('colab').where({ id: uniqueId }).update({ demandante: currentEmail })
            let settled = false
            pending = previous.request('POST', '/registros', evaluation(uniqueName, uniqueId), previous.token)
                .then(result => { settled = true; return result })
            await waitForLock(root, profile.database, () => settled)
            await transfer.commit()
            assert.equal((await pending).status, 403)
        } finally {
            if (!transfer.isCompleted()) await transfer.rollback()
            if (pending) await pending.catch(() => {})
        }
        const allowed = await current.request('POST', '/registros', evaluation(uniqueName, uniqueId), current.token)
        assert.equal(allowed.status, 204)
        return { namesakesAndIdSelection: true, rejectedWritesDoNotInsert: true, assignmentTransfersHistory: true,
            previousSessionLosesAccess: true, administratorAuthorshipVisible: true, authorsAndTimestampsPreserved: true,
            legacyHistoryAdminOnly: true, filteringBeforePagination: true, foreignKeyRejectsMissingParent: true,
            referencedProfessionalDeletionRestricted: true, exactCanonicalAssignment: true, accentCollationAmbiguityRejected: true,
            legacyUniqueNameResolvesId: true, concurrentTransferWaitObserved: true, staleConcurrentWriterRejected: true }
    } finally {
        for (const client of clients) await client.request('POST', '/signout', {}, client.token).catch(() => {})
        await runtime.close()
    }
}

async function apply({ profile, root, verifyServer, database, startApplication, browser, validateAuthentication, progress = () => {} }) {
    const version = await verifyServer(root, profile)
    const filename = process.env.EVAL_ISOLATED_LINKS_RECOVERY_REPORT
    assert.match(filename || '', /^recovery-report-[a-f0-9]{12}\.json$/)
    const recovery = JSON.parse(fs.readFileSync(path.join(profile.directory, filename), 'utf8'))
    const target = recoveryTarget(profile, recovery, filename)
    assert.ok(fs.existsSync(path.join(profile.directory, recovery.encryptedArtifact)))
    for (const name of [profile.database, target.name]) {
        const [[marker]] = await root.query('SELECT profile_id FROM ??.isolation_marker', [name])
        assert.equal(marker.profile_id, profile.id)
    }
    const [connections] = await root.query('SELECT ID AS id, DB AS db FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND DB IN (?, ?)', [profile.database, target.name])
    assert.equal(connections.length, 0, 'Close source/recovery writers before migration')
    const sourceBefore = await businessSnapshot(root, profile.database)
    assert.deepEqual(await businessSnapshot(root, target.name), sourceBefore, 'Recovery business data must still match source')
    await root.query('GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON ??.* TO ?@?', [target.name, 'evaluation_migrator', '127.0.0.1'])
    const copyProfile = { ...profile, database: target.name }
    progress('migrate-recovery-copy')
    let db = database(copyProfile, 'migrator', target.name)
    let copyMigration
    try { copyMigration = await applyOnlyLinkMigration(db) } finally { await db.destroy() }
    const copyMetadata = await metadata(root, target.name)
    assertPreserved(sourceBefore, await businessSnapshot(root, target.name))
    progress('copy-authentication-regression')
    const auth = {}
    await validateAuthentication(copyProfile, auth)
    progress('copy-ownership-and-concurrency')
    const checks = await ownershipChecks({ profile: copyProfile, root, startApplication, browser,
        originalIds: sourceBefore.registros.map(row => row.id) })
    assert.deepEqual(await businessSnapshot(root, profile.database), sourceBefore, 'Source must stay unchanged until copy validation passes')
    progress('migrate-original-isolated-schema')
    db = database(profile, 'migrator', profile.database)
    let sourceMigration
    try { sourceMigration = await applyOnlyLinkMigration(db) } finally { await db.destroy() }
    const sourceMetadata = await metadata(root, profile.database)
    assertPreserved(sourceBefore, await businessSnapshot(root, profile.database))
    return { success: true, profileId: profile.id, mysqlVersion: version, backupId: target.id,
        sourceDatabase: profile.database, validationDatabase: target.name, backup: recovery,
        copyMigration, sourceMigration, copyMetadata, sourceMetadata, authenticationRegression: auth, checks,
        existingBusinessRowsPreserved: true, existingEvaluationRows: sourceBefore.registros.length,
        existingLinksRemainNull: true, automaticBackfill: false, testsWriteOnlyRecoveryCopy: true,
        smtpDelivery: false, completedUtc: new Date().toISOString() }
}

module.exports = { apply, recoveryTarget, applyOnlyLinkMigration, expectSqlFailure }
