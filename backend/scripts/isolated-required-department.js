// Explicit 13 -> 14 transition for the approved fictional source only.
// Does not import production bootstrap/configuration, infer links or send mail.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { randomBytes, createHash } = require('node:crypto')
const { recover, unseal } = require('./isolated-recovery')
const { recoveryTarget } = require('./isolated-record-links')
const { encryptDetails } = require('./isolated-inventory')
const { grantCopyMigration } = require('./isolated-activate-management')

const migrationName = '20261028000100_require_colab_gerencia.js'
const confirmationText = 'colab.gerencia_id:NOT_NULL:13->14'
const same = (a, b) => assert.ok(JSON.stringify(a) === JSON.stringify(b), 'Required department state mismatch')
const directory = path.join(__dirname, '../migrations')
const migrationFiles = () => fs.readdirSync(directory).filter(name => /^\d+_.*\.js$/.test(name)).sort()

function assertApprovedTarget(profile, confirmation) {
    assert.equal(profile.id, '0f8785e640294ebbbd5490d74b01e59a')
    assert.equal(profile.database, 'evaluation_isolated_0f8785e64029_v2')
    assert.equal(profile.host, '127.0.0.1')
    assert.ok(Number.isInteger(profile.port) && profile.port > 1024 && profile.port <= 65535 && profile.port !== 3306)
    assert.equal(confirmation, confirmationText)
}

async function business(root, name) {
    const state = {}
    for (const table of ['users2', 'gerencias', 'colab', 'registros']) {
        const [rows] = await root.query('SELECT * FROM ??.?? ORDER BY id LIMIT 10001', [name, table])
        assert.ok(rows.length <= 10000)
        state[table] = rows
    }
    return state
}

async function assertStructure(root, name, count, profileId) {
    assert.ok([13, 14].includes(count))
    const files = migrationFiles()
    assert.equal(files.length, 14); assert.equal(files.at(-1), migrationName)
    const [markers] = await root.query('SELECT profile_id FROM ??.isolation_marker', [name])
    same(markers.map(row => row.profile_id), [profileId])
    const [completed] = await root.query('SELECT name FROM ??.migrations ORDER BY name', [name])
    same(completed.map(row => row.name), files.slice(0, count))
    const [tables] = await root.query('SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [name])
    assert.equal(tables.length, 9); assert.ok(tables.every(row => row.engine === 'InnoDB'))
    for (const [catalog, schemaColumn] of [['TRIGGERS', 'TRIGGER_SCHEMA'], ['ROUTINES', 'ROUTINE_SCHEMA'], ['EVENTS', 'EVENT_SCHEMA']]) {
        const [[objects]] = await root.query('SELECT COUNT(*) AS total FROM information_schema.?? WHERE ?? = ?', [catalog, schemaColumn, name])
        assert.equal(Number(objects.total), 0)
    }
    const [columns] = await root.query('SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS defaultValue, EXTRA AS extra, CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION', [name])
    const column = columns.find(row => row.tableName === 'colab' && row.name === 'gerencia_id')
    assert.ok(column); assert.equal(column.type, 'int unsigned'); assert.equal(column.nullable, count === 13 ? 'YES' : 'NO')
    const owner = columns.find(row => row.tableName === 'gerencias' && row.name === 'demandante_id')
    assert.ok(owner); assert.equal(owner.type, 'int unsigned'); assert.equal(owner.nullable, 'NO')
    const [indexes] = await root.query('SELECT TABLE_NAME AS tableName, INDEX_NAME AS name, NON_UNIQUE AS nonUnique, SEQ_IN_INDEX AS position, COLUMN_NAME AS columnName, INDEX_TYPE AS type FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX', [name])
    same(indexes.filter(row => row.tableName === 'colab' && row.name === 'colab_gerencia_active_index').map(row => row.columnName), ['gerencia_id', 'deletedAt'])
    const [foreignKeys] = await root.query('SELECT k.TABLE_NAME AS tableName, k.CONSTRAINT_NAME AS name, k.COLUMN_NAME AS columnName, k.REFERENCED_TABLE_NAME AS parentTable, k.REFERENCED_COLUMN_NAME AS parentColumn, r.DELETE_RULE AS deleteRule, r.UPDATE_RULE AS updateRule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.TABLE_NAME = k.TABLE_NAME AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA = ? ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION', [name])
    for (const [tableName, columnName, parentTable] of [['colab', 'gerencia_id', 'gerencias'], ['gerencias', 'demandante_id', 'users2'], ['registros', 'colab_id', 'colab']]) {
        const fk = foreignKeys.find(row => row.tableName === tableName && row.columnName === columnName)
        assert.ok(fk); assert.equal(fk.parentTable, parentTable); assert.equal(fk.parentColumn, 'id')
        assert.equal(fk.deleteRule, 'RESTRICT'); assert.equal(fk.updateRule, 'RESTRICT')
    }
    const [[invalid]] = await root.query('SELECT COUNT(*) AS total FROM ??.colab c LEFT JOIN ??.gerencias g ON g.id = c.gerencia_id LEFT JOIN ??.users2 u ON u.id = g.demandante_id WHERE c.gerencia_id IS NULL OR g.id IS NULL OR u.id IS NULL', [name, name, name])
    assert.equal(Number(invalid.total), 0)
    return { tables, columns, indexes, foreignKeys }
}

function expectedStructure(before) {
    return { ...before, columns: before.columns.map(row => row.tableName === 'colab' && row.name === 'gerencia_id'
        ? { ...row, nullable: 'NO' } : row) }
}

async function applyOnlyRequiredDepartment(db) {
    const files = migrationFiles()
    assert.equal(files.length, 14); assert.equal(files.at(-1), migrationName)
    const options = { tableName: 'migrations', migrationSource: { async getMigrations() { return files },
        getMigrationName(name) { return name }, getMigration(name) { return require(path.join(directory, name)) } } }
    const names = rows => rows.map(row => row.file || row.name || row)
    const [before, pending] = await db.migrate.list(options)
    same(names(before), files.slice(0, 13)); same(names(pending), [migrationName])
    const [, applied] = await db.migrate.latest(options)
    same(applied, [migrationName])
    const [after, remaining] = await db.migrate.list(options)
    same(names(after), files); assert.equal(remaining.length, 0)
}

async function expectRejection(operation, codes) {
    try { await operation() } catch (error) {
        if (codes.includes(error.errno)) return
        throw Object.assign(new Error('Unexpected SQL rejection'), { code: 'REQUIRED_DEPARTMENT_UNEXPECTED_SQL_REJECTION' })
    }
    throw Object.assign(new Error('Expected SQL rejection missing'), { code: 'REQUIRED_DEPARTMENT_SQL_REJECTION_MISSING' })
}

async function assertNoWriters(root, names) {
    const [connections] = await root.query('SELECT ID FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND DB IN (' + names.map(() => '?').join(', ') + ')', names)
    assert.equal(connections.length, 0, 'Suspend source/recovery connections before DDL')
}

async function archivedPreflight(db) {
    const rollback = new Error('COPY_PROBE_ROLLBACK')
    try {
        await db.transaction(async trx => {
            await trx('colab').insert({ colab: 'Profissional fictício arquivado sem gerência', demandante: 'fixture@example.invalid', gerencia_id: null, deletedAt: new Date() })
            await assert.rejects(require(path.join(directory, migrationName)).up(trx), { code: 'PROFESSIONAL_DEPARTMENT_LINKS_REQUIRED' })
            throw rollback
        })
    } catch (error) { if (error !== rollback) throw error }
}

async function sqlChecks(root, name, before) {
    const person = before.colab[0], department = before.gerencias[0]
    assert.ok(person && department)
    const missingDepartment = 4294967295, missingUser = 4294967295
    assert.ok(!before.gerencias.some(row => row.id === missingDepartment) && !before.users2.some(row => row.id === missingUser))
    await root.beginTransaction()
    try {
        await expectRejection(() => root.query('INSERT INTO ??.colab (colab, demandante) VALUES (?, ?)', [name, 'Profissional fictício sem gerência', 'fixture@example.invalid']), [1364])
        await expectRejection(() => root.query('INSERT INTO ??.colab (colab, demandante, gerencia_id) VALUES (?, ?, NULL)', [name, 'Profissional fictício nulo', 'fixture@example.invalid']), [1048])
        await expectRejection(() => root.query('UPDATE ??.colab SET gerencia_id = NULL WHERE id = ?', [name, person.id]), [1048])
        await expectRejection(() => root.query('UPDATE ??.colab SET gerencia_id = ? WHERE id = ?', [name, missingDepartment, person.id]), [1452])
        await expectRejection(() => root.query('UPDATE ??.gerencias SET demandante_id = ? WHERE id = ?', [name, missingUser, department.id]), [1452])
        await expectRejection(() => root.query('DELETE FROM ??.gerencias WHERE id = ?', [name, person.gerencia_id]), [1451])
        await expectRejection(() => root.query('DELETE FROM ??.users2 WHERE id = ?', [name, department.demandante_id]), [1451])
        const [inserted] = await root.query('INSERT INTO ??.colab (colab, demandante, gerencia_id, deletedAt) VALUES (?, ?, ?, NOW())', [name, 'Profissional fictício arquivado', 'fixture@example.invalid', department.id])
        await expectRejection(() => root.query('UPDATE ??.colab SET gerencia_id = NULL WHERE id = ?', [name, inserted.insertId]), [1048])
    } finally { await root.rollback() }
    same(await business(root, name), before)
    return { omittedAndNullInsertRejected: true, nullUpdateRejected: true, archivedNullRejected: true,
        invalidParentsRejected: true, parentDeletionRejected: true, transactionRolledBack: true }
}

async function readHttp({ profile, before, startApplication, browser }) {
    const runtime = await startApplication(profile)
    try {
        assert.equal((await browser(runtime).request('GET', '/colab')).status, 401)
        for (const [email, variable] of [['admin@example.invalid', 'EVAL_ISOLATED_ADMIN_PASSWORD'], ['reviewer@example.invalid', 'EVAL_ISOLATED_EVALUATOR_PASSWORD']]) {
            const user = browser(runtime)
            try {
                assert.equal((await user.login(email, process.env[variable])).status, 200)
                const people = await user.request('GET', '/colab?estado=todos')
                assert.equal(people.status, 200)
                same(people.json().map(row => row.id).sort((a, b) => a - b), before.colab.map(row => row.id).sort((a, b) => a - b))
                for (const url of ['/registros', '/registros2?page=1&limit=100']) {
                    const response = await user.request('GET', url)
                    assert.equal(response.status, 200)
                    same(response.json().map(row => row.id).sort((a, b) => a - b), before.registros.map(row => row.id).sort((a, b) => a - b))
                }
                if (email === 'reviewer@example.invalid') assert.equal((await user.request('GET', '/demandantes')).status, 403)
            } finally { if (user.cookie) assert.equal((await user.request('POST', '/signout', {}, await user.csrf())).status, 204) }
        }
        return { adminAndEvaluatorLogin: true, professionalAndHistoryAccessPreserved: true, adminAuthorizationPreserved: true }
    } finally { await runtime.close() }
}

async function managementHttp({ profile, root, before, startApplication, browser }) {
    // Writes are permitted exclusively on this new recovery copy, never the source.
    assert.match(profile.database, /^evaluation_isolated_0f8785e64029_v2_restore_[a-f0-9]{12}$/)
    const runtime = await startApplication(profile), admin = browser(runtime)
    const suffix = randomBytes(6).toString('hex')
    const email = 'required.' + suffix + '@example.invalid', name = 'Profissional fictício ' + suffix
    try {
        assert.equal((await admin.login('admin@example.invalid', process.env.EVAL_ISOLATED_ADMIN_PASSWORD)).status, 200)
        const token = await admin.csrf()
        assert.equal((await admin.request('POST', '/demandantes', { name: 'Demandante fictício', email, password: process.env.EVAL_ISOLATED_EVALUATOR_PASSWORD }, token)).status, 204)
        const users = await admin.request('GET', '/demandantes')
        assert.equal(users.status, 200)
        const owner = users.json().find(row => row.email === email)
        assert.ok(owner && !before.users2.some(row => row.id === owner.id))
        const departmentName = 'Gerência fictícia ' + suffix
        assert.equal((await admin.request('POST', '/gerencias', { nome: departmentName, demandante_id: owner.id }, token)).status, 204)
        const departments = await admin.request('GET', '/gerencias')
        assert.equal(departments.status, 200)
        const department = departments.json().find(row => row.nome === departmentName)
        assert.ok(department && !before.gerencias.some(row => row.id === department.id))
        assert.equal((await admin.request('POST', '/colab', { colab: name }, token)).status, 400)
        assert.equal((await admin.request('POST', '/colab', { colab: name, gerencia_id: before.gerencias[0].id }, token)).status, 204)
        const people = await admin.request('GET', '/colab')
        assert.equal(people.status, 200)
        const person = people.json().find(row => row.colab === name)
        assert.ok(person && !before.colab.some(row => row.id === person.id))
        assert.equal((await admin.request('PUT', '/colab/' + person.id, { colab: name, gerencia_id: null }, token)).status, 400)
        assert.equal((await admin.request('PUT', '/colab/' + person.id, { colab: name, gerencia_id: department.id }, token)).status, 204)
        assert.equal((await admin.request('DELETE', '/gerencias/' + department.id, {}, token)).status, 409)
        assert.equal((await admin.request('DELETE', '/colab/' + person.id, {}, token)).status, 204)
        const archived = await admin.request('GET', '/colab?estado=todos')
        assert.equal(archived.status, 200)
        assert.ok(archived.json().some(row => row.id === person.id && row.deletedAt && row.gerencia_id === department.id))
        assert.equal((await admin.request('DELETE', '/gerencias/' + department.id, {}, token)).status, 204)
        assert.equal((await admin.request('DELETE', '/demandantes/' + owner.id, {}, token)).status, 409)
        // Remove only the three new fixture IDs on the recovery copy, in FK order.
        for (const [table, id] of [['colab', person.id], ['gerencias', department.id], ['users2', owner.id]]) {
            const [removed] = await root.query('DELETE FROM ??.?? WHERE id = ?', [profile.database, table, id])
            assert.equal(removed.affectedRows, 1)
        }
        same(await business(root, profile.database), before)
        return { createAndTransfer: true, invalidLinkRejected: true, archiveRetainsLink: true,
            archivedDepartmentOwnerDeletionBlocked: true, originalBusinessRowsPreserved: true }
    } finally {
        try { if (admin.cookie) await admin.request('POST', '/signout', {}, await admin.csrf()) }
        finally { await runtime.close() }
    }
}

async function runTransition({ state, checkpoint, prepareCopy, verifyCopy, revalidateSource, applySource, verifySource }) {
    try {
        checkpoint('copy-migration')
        await prepareCopy()
        checkpoint('copy-verification')
        const copy = await verifyCopy()
        state.copyVerified = true
        checkpoint('source-revalidation')
        await revalidateSource()
        state.sourceSchemaAttempted = true
        checkpoint('source-migration')
        await applySource()
        state.sourceSchemaApplied = true
        checkpoint('source-verification')
        const source = await verifySource()
        checkpoint('verified')
        return { copy, source }
    } catch (error) { checkpoint('failed'); throw error }
}

async function enforce({ profile, root, verifyServer, database, startApplication, browser, confirmation, secret, recoveryKey, progress = () => {} }) {
    assertApprovedTarget(profile, confirmation)
    assert.match(secret || '', /^[a-f0-9]{64}$/); assert.match(recoveryKey || '', /^[a-f0-9]{64}$/)
    await verifyServer(root, profile)
    await assertNoWriters(root, [profile.database])
    const schema = await assertStructure(root, profile.database, 13, profile.id)
    const before = await business(root, profile.database)
    assert.equal(before.colab.length, 2); assert.equal(before.registros.length, 8); assert.equal(before.gerencias.length, 1)
    const migrationDigest = () => createHash('sha256').update(fs.readFileSync(path.join(directory, migrationName))).digest('hex')
    const digest = migrationDigest(), id = randomBytes(6).toString('hex')
    const manifestName = 'required-department-manifest-' + id + '.evalinventory'
    fs.writeFileSync(path.join(profile.directory, manifestName), JSON.stringify(encryptDetails({ before, schema, migrationDigest: digest }, secret,
        profile.id + ':' + profile.database + ':required-department:' + id, profile.id)), { flag: 'wx', mode: 0o600 })
    const reportName = 'required-department-report-' + id + '.json'
    const state = { copyVerified: false, sourceSchemaAttempted: false, sourceSchemaApplied: false }
    const report = { reportName, manifestName, migration: migrationName }
    const checkpoint = phase => {
        fs.writeFileSync(path.join(profile.directory, reportName), JSON.stringify({ ...report, ...state, phase, updatedUtc: new Date().toISOString() }, null, 2),
            { flag: phase === 'prepared' ? 'wx' : 'w' })
        progress(phase)
    }
    checkpoint('prepared')
    try {
        checkpoint('backup-recovery')
        const backup = await recover({ profile, root, startApplication, browser })
        const recoveryReportName = backup.encryptedArtifact.replace(/^backup-/, 'recovery-report-').replace(/\.evalbackup$/, '.json')
        const target = recoveryTarget(profile, backup, recoveryReportName)
        report.recoveryReportName = recoveryReportName; report.encryptedBackup = backup.encryptedArtifact; report.copyDatabase = target.name
        const key = Buffer.from(recoveryKey, 'hex')
        let plain
        try { plain = unseal(JSON.parse(fs.readFileSync(path.join(profile.directory, backup.encryptedArtifact), 'utf8')), key, profile.id + ':' + profile.database) }
        finally { key.fill(0); if (plain) plain.fill(0) }
        const names = [profile.database, target.name]
        await assertNoWriters(root, names)
        same(await business(root, profile.database), before); same(await business(root, target.name), before)
        same(await assertStructure(root, target.name, 13, profile.id), schema)
        const apply = async name => {
            assert.ok(names.includes(name)); assert.equal(migrationDigest(), digest)
            const db = database({ ...profile, database: name }, 'migrator', name)
            try { await applyOnlyRequiredDepartment(db) } finally { await db.destroy() }
            same(await assertStructure(root, name, 14, profile.id), expectedStructure(schema))
            same(await business(root, name), before)
        }
        const results = await runTransition({ state, checkpoint,
            async prepareCopy() {
                await grantCopyMigration(root, profile, target.name)
                const db = database({ ...profile, database: target.name }, 'migrator', target.name)
                try { await archivedPreflight(db) } finally { await db.destroy() }
                same(await business(root, target.name), before)
                same(await assertStructure(root, target.name, 13, profile.id), schema)
                await apply(target.name)
                await assert.rejects((async () => {
                    const repeated = database({ ...profile, database: target.name }, 'migrator', target.name)
                    try { await applyOnlyRequiredDepartment(repeated) } finally { await repeated.destroy() }
                })(), { code: 'ERR_ASSERTION' })
            },
            async verifyCopy() {
                const sql = await sqlChecks(root, target.name, before)
                const http = await managementHttp({ profile: { ...profile, database: target.name }, root, before, startApplication, browser })
                const reads = await readHttp({ profile: { ...profile, database: target.name }, before, startApplication, browser })
                same(await business(root, target.name), before)
                same(await assertStructure(root, target.name, 14, profile.id), expectedStructure(schema))
                return { archivedPreflightRejected: true, repeatedTransitionRejected: true, sql, http, reads }
            },
            async revalidateSource() {
                await verifyServer(root, profile); await assertNoWriters(root, names)
                same(await assertStructure(root, profile.database, 13, profile.id), schema)
                same(await business(root, profile.database), before)
            },
            async applySource() { await apply(profile.database) },
            async verifySource() {
                const http = await readHttp({ profile, before, startApplication, browser })
                same(await business(root, profile.database), before)
                same(await assertStructure(root, profile.database, 14, profile.id), expectedStructure(schema))
                return { http, accountsAndBusinessRowsPreserved: true }
            }
        })
        const result = { ...report, ...state, success: true, completedUtc: new Date().toISOString(),
            sourceMigrations: 14, professionalsPreserved: before.colab.length, evaluationsPreserved: before.registros.length,
            backupTablesCompared: backup.tablesCompared, backupRowsCompared: backup.rowsCompared, ...results, smtpDelivery: false }
        fs.writeFileSync(path.join(profile.directory, reportName), JSON.stringify(result, null, 2))
        return result
    } catch (error) {
        checkpoint('failed')
        const line = error.stack?.match(/isolated-required-department\.js:(\d+):/)?.[1] || 'UNKNOWN'
        const code = /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'UNKNOWN'
        throw Object.assign(new Error('Required department transition failed; preserve backup and checkpoint'),
            { code: 'REQUIRED_DEPARTMENT_FAILED_' + code + '_AT_' + line })
    }
}

module.exports = { enforce, assertApprovedTarget, assertStructure, expectedStructure, applyOnlyRequiredDepartment,
    expectRejection, assertNoWriters, archivedPreflight, runTransition, confirmationText, migrationName }
