// Copy-only validation. No source DDL/DML, automatic association or production bootstrap.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { randomBytes, createHash } = require('node:crypto')
const { mysqlClient, seal, unseal } = require('./isolated-recovery')
const migrationName = '20261027000100_add_management_departments.js'
const same = (a, b) => assert.ok(JSON.stringify(a) === JSON.stringify(b), 'Copy/source state mismatch')

function previewTarget(profile, report, filename) {
    const match = /^management-report-([a-f0-9]{12})\.json$/.exec(filename || '')
    assert.ok(match)
    assert.equal(report.success, true)
    assert.equal(report.sourceDatabase, profile.database)
    assert.equal(report.sourceBusinessAndSchemaPreserved, true)
    assert.equal(report.copyMigrations, 13)
    assert.equal(report.copyDatabase, profile.database + '_mgmt_' + match[1])
    assert.equal(report.encryptedBackup, 'management-backup-' + match[1] + '.evalbackup')
    return report.copyDatabase
}

async function business(root, name, lock = false) {
    const result = {}
    for (const table of ['users2', 'colab', 'registros']) {
        const [rows] = await root.query('SELECT * FROM ??.?? ORDER BY id LIMIT 10001' + (lock ? ' FOR SHARE' : ''), [name, table])
        assert.ok(rows.length <= 10000)
        result[table] = rows
    }
    return result
}

async function definitions(root, name) {
    const [tables] = await root.query('SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [name])
    assert.equal(tables.length, 8)
    const result = {}
    for (const table of tables) {
        assert.equal(table.engine, 'InnoDB')
        const [rows] = await root.query('SHOW CREATE TABLE ??.??', [name, table.name])
        result[table.name] = rows[0]['Create Table']
    }
    return result
}

async function migrateManagementCopy(db) {
    const files = fs.readdirSync(path.join(__dirname, '../migrations')).filter(name => /^\d+_.*\.js$/.test(name)).sort()
    const options = { tableName: 'migrations', migrationSource: { async getMigrations() { return files },
        getMigrationName(name) { return name }, getMigration(name) { return require(path.join(__dirname, '../migrations', name)) } } }
    const [completed, pending] = await db.migrate.list(options)
    assert.equal(completed.length, 12)
    same(pending.map(row => row.file || row.name || row), [migrationName])
    const [, applied] = await db.migrate.latest(options)
    same(applied, [migrationName])
    const [after, remaining] = await db.migrate.list(options)
    assert.equal(after.length, 13); assert.equal(remaining.length, 0)
}

async function waitForDepartmentLock(root, name, finished) {
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
        const [[row]] = await root.query('SELECT COUNT(*) AS count FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE = w.ENGINE WHERE l.OBJECT_SCHEMA = ? AND l.OBJECT_NAME = ?', [name, 'gerencias'])
        if (Number(row.count) > 0) return
        assert.equal(finished(), false)
        await new Promise(resolve => setTimeout(resolve, 40))
    }
    throw new Error('Department wait not observed')
}

async function validateCopy({ profile, root, startApplication, browser, before }) {
    const runtime = await startApplication(profile)
    const checks = {}
    let blocker
    try {
        const admin = browser(runtime), reviewer = browser(runtime)
        assert.equal((await admin.login('admin@example.invalid', process.env.EVAL_ISOLATED_ADMIN_PASSWORD)).status, 200)
        assert.equal((await reviewer.login('reviewer@example.invalid', process.env.EVAL_ISOLATED_EVALUATOR_PASSWORD)).status, 200)
        const token = await admin.csrf()
        const mutate = (method, url, body = {}) => admin.request(method, url, body, token)
        assert.equal((await reviewer.request('GET', '/demandantes')).status, 403)
        assert.equal((await reviewer.request('GET', '/registros')).json().length, 0)
        assert.equal((await admin.request('GET', '/registros')).json().length, before.registros.length)
        checks.unassignedLegacyAdminOnly = true
        const owner = before.users2.find(row => row.email === 'reviewer@example.invalid')
        assert.ok(owner)
        for (const nome of ['Gerência fictícia A', 'Gerência fictícia B']) assert.equal((await mutate('POST', '/gerencias', { nome, demandante_id: owner.id })).status, 204)
        const departments = (await admin.request('GET', '/gerencias')).json()
        assert.equal(departments.length, 2)
        assert.equal((await reviewer.request('GET', '/gerencias')).json().length, 2)
        assert.ok(before.colab.length === 2 && before.registros.length === 8)
        for (let index = 0; index < before.colab.length; index++) assert.equal((await mutate('PUT', '/colab/' + before.colab[index].id,
            { colab: before.colab[index].colab, gerencia_id: departments[index].id })).status, 204)
        checks.explicitCopyFixtureAssignment = true
        assert.equal((await reviewer.request('GET', '/registros')).json().length, 8)
        const email = 'management.' + randomBytes(6).toString('hex') + '@example.invalid'
        const password = randomBytes(24).toString('hex')
        assert.equal((await mutate('POST', '/demandantes', { name: 'Demandante fictício adicional', email, password })).status, 204)
        assert.equal((await mutate('POST', '/demandantes', { name: 'Duplicado', email, password })).status, 409)
        assert.equal((await mutate('POST', '/demandantes', { name: 'Injeção', email, password, admin: true })).status, 400)
        const accounts = (await admin.request('GET', '/demandantes')).json()
        assert.ok(accounts.every(row => !Object.hasOwn(row, 'password')))
        const currentId = accounts.find(row => row.email === email).id
        const current = browser(runtime); assert.equal((await current.login(email, password)).status, 200)
        assert.equal((await mutate('PUT', '/gerencias/' + departments[0].id, { nome: 'Gerência fictícia A', demandante_id: currentId })).status, 204)
        assert.equal((await reviewer.request('GET', '/registros')).json().length, 0)
        assert.equal((await reviewer.request('GET', '/registros/' + before.registros[0].id)).status, 404)
        assert.equal((await current.request('GET', '/registros')).json().length, 8)
        checks.departmentTransferExistingSessions = true
        const primary = before.colab[0]
        assert.equal((await mutate('PUT', '/colab/' + primary.id, { colab: primary.colab + ' corrigido', gerencia_id: departments[0].id })).status, 204)
        const renamed = (await current.request('GET', '/colab/' + primary.id)).json()
        assert.equal(renamed.colab, primary.colab + ' corrigido')
        same((await business(root, profile.database)).registros, before.registros)
        checks.renamePreservesHistoricalRows = true
        // Only the restored copy is used for a real transfer-vs-write race.
        blocker = await runtime.db.transaction()
        await blocker('gerencias').where({ id: departments[1].id }).forUpdate().first()
        const record = { colab: before.colab[1].colab, colab_id: before.colab[1].id, avaliacao: '5', nivel: 'A', desconto: '0%',
            nota_qualidade: '5', nota_prazo: '5', nota_dispon: '5', nota_respon: '5',
            obs_qualidade: '', obs_prazo: '', obs_dispon: '', obs_respon: '' }
        let finished = false
        const pending = reviewer.request('POST', '/registros', record, await reviewer.csrf()).then(response => { finished = true; return response })
        // Handle rejections while the lock probe is still awaiting its observation.
        pending.catch(() => {})
        await waitForDepartmentLock(root, profile.database, () => finished)
        await blocker('gerencias').where({ id: departments[1].id }).update({ demandante_id: currentId })
        await blocker.commit(); blocker = null
        assert.equal((await pending).status, 403)
        same((await business(root, profile.database)).registros, before.registros)
        checks.concurrentTransferBlocksStaleWrite = true
        assert.equal((await mutate('DELETE', '/demandantes/' + currentId)).status, 409)
        assert.equal((await mutate('DELETE', '/gerencias/' + departments[0].id)).status, 409)
        assert.equal((await mutate('DELETE', '/colab/' + primary.id)).status, 204)
        assert.equal((await current.request('GET', '/colab/' + primary.id)).status, 404)
        assert.equal((await current.request('GET', '/registros')).json().length, 8)
        assert.equal((await current.request('POST', '/registros', { ...record, colab: renamed.colab, colab_id: primary.id }, await current.csrf())).status, 403)
        assert.equal((await mutate('DELETE', '/gerencias/' + departments[0].id)).status, 204)
        assert.equal((await current.request('GET', '/registros')).json().length, 8)
        checks.archivePreservesHistoryAndBlocksWrites = true
        for (const row of departments) assert.equal((await mutate('PUT', '/gerencias/' + row.id, { nome: row.nome, demandante_id: owner.id })).status, 204)
        const changedEmail = 'renamed.' + email
        assert.equal((await mutate('PUT', '/demandantes/' + currentId, { name: 'Nome atualizado', email: changedEmail })).status, 204)
        assert.equal((await current.request('GET', '/session')).status, 401)
        assert.equal((await current.login(changedEmail, password)).status, 200)
        assert.equal((await mutate('DELETE', '/demandantes/' + currentId)).status, 204)
        assert.equal((await current.request('GET', '/session')).status, 401)
        assert.equal((await mutate('DELETE', '/demandantes/' + before.users2.find(row => row.admin).id)).status, 409)
        assert.equal((await reviewer.request('GET', '/registros')).json().length, 8)
        same((await business(root, profile.database)).registros, before.registros)
        checks.accountEditsDeletionAndSessionRevocation = true
        checks.originalEvaluationRowsPreserved = true
        for (const client of [reviewer, admin]) assert.equal((await client.request('POST', '/signout', {}, await client.csrf())).status, 204)
        return checks
    } finally {
        if (blocker) await blocker.rollback().catch(() => {})
        await runtime.close()
    }
}

async function validate({ profile, root, verifyServer, database, startApplication, browser, progress = () => {} }) {
    assert.equal(profile.id, '0f8785e640294ebbbd5490d74b01e59a')
    const version = await verifyServer(root, profile)
    assert.match(process.env.EVAL_ISOLATED_RECOVERY_KEY || '', /^[a-f0-9]{64}$/)
    const key = Buffer.from(process.env.EVAL_ISOLATED_RECOVERY_KEY, 'hex')
    const id = randomBytes(6).toString('hex'), target = profile.database + '_mgmt_' + id
    const artifact = 'management-backup-' + id + '.evalbackup'
    const config = path.join(profile.directory, 'management-client-' + id + '.cnf')
    let dump, restoredSql, db, locked = false
    try {
        const [[marker]] = await root.query('SELECT profile_id FROM ??.isolation_marker', [profile.database]); assert.equal(marker.profile_id, profile.id)
        const [migrations] = await root.query('SELECT name FROM ??.migrations ORDER BY name', [profile.database]); assert.equal(migrations.length, 12)
        const [found] = await root.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [target]); assert.equal(found.length, 0)
        for (const [table, field] of [['TRIGGERS', 'TRIGGER_SCHEMA'], ['ROUTINES', 'ROUTINE_SCHEMA'], ['EVENTS', 'EVENT_SCHEMA']]) {
            const [[row]] = await root.query('SELECT COUNT(*) AS total FROM information_schema.?? WHERE ?? = ?', [table, field, profile.database]); assert.equal(Number(row.total), 0)
        }
        progress('source-read-locks-and-backup')
        await root.query('SET SESSION innodb_lock_wait_timeout = 5')
        await root.query('START TRANSACTION'); locked = true
        // Share-lock only business tables for a stable dump. Local session writes may continue.
        const before = await business(root, profile.database, true), ddl = await definitions(root, profile.database)
        fs.writeFileSync(config, '[client]\nhost=127.0.0.1\nport=' + profile.port + '\nprotocol=TCP\nuser=root\npassword=' + process.env.EVAL_ISOLATED_ROOT_PASSWORD + '\n', { flag: 'wx' })
        dump = mysqlClient(path.dirname(profile.binary), 'mysqldump', config, ['--single-transaction', '--quick', '--skip-comments', '--hex-blob', '--set-gtid-purged=OFF', '--no-tablespaces', '--default-character-set=utf8mb4', profile.database])
        assert.equal(/^\s*(USE|CREATE DATABASE|DROP DATABASE)\b/im.test(dump.toString('utf8')), false)
        const identity = profile.id + ':' + profile.database + ':management:' + id
        fs.writeFileSync(path.join(profile.directory, artifact), JSON.stringify(seal(dump, key, identity)), { flag: 'wx' })
        restoredSql = unseal(JSON.parse(fs.readFileSync(path.join(profile.directory, artifact), 'utf8')), key, identity)
        assert.ok(createHash('sha256').update(dump).digest().equals(createHash('sha256').update(restoredSql).digest()))
        await root.query('ROLLBACK'); locked = false
        progress('restore-new-copy')
        await root.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci', [target])
        mysqlClient(path.dirname(profile.binary), 'mysql', config, ['--binary-mode', '--default-character-set=utf8mb4', target], restoredSql)
        same(await definitions(root, target), ddl); same(await business(root, target), before)
        await root.query('GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON ??.* TO ?@?', [target, 'evaluation_migrator', '127.0.0.1'])
        await root.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ??.* TO ?@?', [target, 'evaluation_app', '127.0.0.1'])
        const copyProfile = { ...profile, database: target }
        db = database(copyProfile, 'migrator', target)
        progress('migrate-copy-only')
        await migrateManagementCopy(db)
        await db.destroy(); db = null
        const afterMigration = await business(root, target)
        same(afterMigration.users2, before.users2); same(afterMigration.registros, before.registros)
        same(afterMigration.colab.map(({ gerencia_id, deletedAt, ...row }) => row), before.colab)
        assert.ok(afterMigration.colab.every(row => row.gerencia_id === null && row.deletedAt === null))
        progress('copy-http-and-concurrency')
        const checks = await validateCopy({ profile: copyProfile, root, startApplication, browser, before })
        same(await business(root, profile.database), before); same(await definitions(root, profile.database), ddl)
        const report = { success: true, completedUtc: new Date().toISOString(), mysqlVersion: version,
            sourceDatabase: profile.database, copyDatabase: target, encryptedBackup: artifact,
            sourceMigrations: 12, copyMigrations: 13, migrationAppliedOnlyToCopy: migrationName,
            backupAuthenticated: true, restoredBusinessAndDdlMatch: true, noAutomaticDepartmentAssignment: true,
            sourceBusinessAndSchemaPreserved: true, checks, smtpDelivery: false }
        const reportName = 'management-report-' + id + '.json'
        fs.writeFileSync(path.join(profile.directory, reportName), JSON.stringify(report, null, 2), { flag: 'wx' })
        return { ...report, reportName }
    } finally {
        if (locked) await root.query('ROLLBACK').catch(() => {})
        if (db) await db.destroy()
        key.fill(0); if (dump) dump.fill(0); if (restoredSql) restoredSql.fill(0)
        if (fs.existsSync(config)) fs.unlinkSync(config)
    }
}

module.exports = { validate, migrateManagementCopy, previewTarget }
