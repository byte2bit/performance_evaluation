// Explicitly reviewed activation, restricted to the existing fictional source.
// Source DDL is reached only after a fresh recovery copy passes the same map.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createHash, randomBytes } = require('node:crypto')
const { encryptDetails, decryptDetails } = require('./isolated-inventory')
const { unseal } = require('./isolated-recovery')
const { recoveryTarget } = require('./isolated-record-links')
const { migrateManagementCopy } = require('./isolated-management')
const { active } = require('../lib/auth/identity')

const migration = '20261027000100_add_management_departments.js'
const same = (a, b) => assert.ok(JSON.stringify(a) === JSON.stringify(b), 'Reviewed activation state mismatch')
const positiveId = id => Number.isInteger(id) && id > 0 && id <= 4294967295

function validateApproval(profile, approval, confirmation) {
    assert.equal(profile.id, '0f8785e640294ebbbd5490d74b01e59a')
    assert.equal(profile.database, 'evaluation_isolated_0f8785e64029_v2')
    assert.equal(approval.profileId, profile.id)
    assert.equal(approval.sourceDatabase, profile.database)
    assert.equal(approval.format, 'evaluation-department-map-v1')
    assert.equal(approval.approved, true)
    assert.equal(confirmation, 'G01:P01,P02:D02')
    assert.equal(approval.confirmation, confirmation)
    assert.equal(approval.migration, migration)
    assert.ok(Date.parse(approval.approvedUtc) >= Date.parse(approval.review.completedUtc))
    assert.equal(approval.departments.length, 1)
    const department = approval.departments[0]
    assert.equal(department.key, 'G01'); assert.equal(department.nome, 'Gerência de Testes')
    assert.ok(positiveId(department.demandante_id))
    assert.equal(approval.review.professionals.length, 2)
    assert.equal(approval.review.records.length, 8)
    assert.equal(approval.review.migrations.length, 12)
    assert.equal(approval.professionals.length, 2)
    assert.equal(new Set(approval.professionals.map(row => row.id)).size, 2)
    same(approval.professionals.map(row => row.id), approval.review.professionals.map(row => row.id))
    assert.ok(approval.professionals.every(row => positiveId(row.id) && row.departmentKey === 'G01'))
    const owner = approval.review.users.find(row => row.id === department.demandante_id)
    assert.ok(active(owner) && !owner.admin && owner.email === approval.review.professionals[0].demandante)
}

function matchesReview(before, review) {
    same(before.colab.map(row => ({ id: row.id, colab: row.colab, gerencia: row.gerencia, demandante: row.demandante })), review.professionals)
    same(before.users2.map(row => ({ id: row.id, name: row.name, email: row.email, admin: row.admin, active: row.active, deletedAt: row.deletedAt })), review.users)
    same(before.registros.map(row => ({ id: row.id, colab_id: row.colab_id })), review.records)
}

async function snapshot(client, name) {
    const result = {}
    for (const table of ['users2', 'colab', 'registros']) {
        const [rows] = await client.query('SELECT * FROM ??.?? ORDER BY id LIMIT 10001', [name, table])
        assert.ok(rows.length <= 10000)
        result[table] = rows
    }
    return result
}

function expectedState(before, approval, departmentId = null) {
    return { ...before, colab: before.colab.map(row => ({ ...row,
        gerencia_id: departmentId === null ? null : approval.professionals.find(item => item.id === row.id) ? departmentId : null,
        deletedAt: null })) }
}

async function assertStructure(root, name, expectedCount, profileId) {
    const [markers] = await root.query('SELECT profile_id FROM ??.isolation_marker', [name])
    same(markers.map(row => row.profile_id), [profileId])
    const [migrations] = await root.query('SELECT name FROM ??.migrations ORDER BY name', [name])
    const files = fs.readdirSync(path.join(__dirname, '../migrations')).filter(file => /^\d+_.*\.js$/.test(file)).sort()
    assert.equal(files.length, 13)
    same(migrations.map(row => row.name), files.slice(0, expectedCount))
    const [tables] = await root.query('SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [name])
    assert.equal(tables.length, expectedCount === 12 ? 8 : 9)
    assert.ok(tables.every(row => row.engine === 'InnoDB'))
    const [triggers] = await root.query('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?', [name])
    assert.equal(triggers.length, 0)
    if (expectedCount === 13) {
        const [oldFk] = await root.query('SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?', [name, 'registros', 'registros_colab_foreign'])
        assert.equal(oldFk.length, 0)
        for (const [table, constraint, parent, column] of [['gerencias', 'gerencias_demandante_id_foreign', 'users2', 'demandante_id'], ['colab', 'colab_gerencia_id_foreign', 'gerencias', 'gerencia_id'], ['registros', 'registros_colab_id_foreign', 'colab', 'colab_id']]) {
            const [rows] = await root.query('SELECT REFERENCED_TABLE_NAME AS parentTable, REFERENCED_COLUMN_NAME AS parentColumn, COLUMN_NAME AS columnName FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?', [name, table, constraint])
            same(rows.map(row => ({ ...row })), [{ parentTable: parent, parentColumn: 'id', columnName: column }])
        }
    }
}

async function grantCopyMigration(root, profile, name) {
    assert.ok(name.startsWith(profile.database + '_restore_'))
    assert.match(name.slice((profile.database + '_restore_').length), /^[a-f0-9]{12}$/)
    assert.notEqual(name, profile.database)
    await root.query('GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON ??.* TO ?@?',
        [name, 'evaluation_migrator', '127.0.0.1'])
}

async function applyApprovedMap(client, name, before, approval) {
    // Pin all reviewed identities before beginning a transaction.
    assert.equal(approval.professionals.length, before.colab.length)
    same(approval.professionals.map(row => row.id).sort((a, b) => a - b), before.colab.map(row => row.id).sort((a, b) => a - b))
    assert.equal(approval.departments.length, 1)
    const definition = approval.departments[0]
    assert.ok(active(before.users2.find(row => row.id === definition.demandante_id)))
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    await client.beginTransaction()
    try {
        const [accounts] = await client.query('SELECT * FROM ??.users2 ORDER BY id FOR SHARE', [name])
        same(accounts, before.users2)
        const [departments] = await client.query('SELECT id FROM ??.gerencias ORDER BY id FOR UPDATE', [name])
        assert.equal(departments.length, 0, 'Never overwrite an existing department map')
        const [professionals] = await client.query('SELECT * FROM ??.colab ORDER BY id FOR UPDATE', [name])
        same(professionals, expectedState(before, approval).colab)
        const [records] = await client.query('SELECT * FROM ??.registros ORDER BY id FOR SHARE', [name])
        same(records, before.registros)
        const [created] = await client.query('INSERT INTO ??.gerencias (nome, demandante_id) VALUES (?, ?)', [name, definition.nome, definition.demandante_id])
        assert.ok(positiveId(created.insertId))
        for (const row of [...approval.professionals].sort((a, b) => a.id - b.id)) {
            const [changed] = await client.query('UPDATE ??.colab SET gerencia_id = ? WHERE id = ? AND gerencia_id IS NULL AND deletedAt IS NULL', [name, created.insertId, row.id])
            assert.equal(changed.affectedRows, 1)
        }
        same(await snapshot(client, name), expectedState(before, approval, created.insertId))
        const [actual] = await client.query('SELECT id, nome, demandante_id, deletedAt FROM ??.gerencias ORDER BY id', [name])
        same(actual.map(row => ({ ...row })), [{ id: created.insertId, nome: definition.nome, demandante_id: definition.demandante_id, deletedAt: null }])
        await client.commit()
        return { departmentId: created.insertId, professionalsAssigned: approval.professionals.length }
    } catch (error) { await client.rollback(); throw error }
}

async function checkHttp({ profile, before, approval, startApplication, browser }) {
    const runtime = await startApplication(profile)
    try {
        const ids = before.colab.map(row => row.id).sort((a, b) => a - b)
        assert.equal((await browser(runtime).request('GET', '/colab')).status, 401)
        for (const [email, variable] of [['reviewer@example.invalid', 'EVAL_ISOLATED_EVALUATOR_PASSWORD'], ['admin@example.invalid', 'EVAL_ISOLATED_ADMIN_PASSWORD']]) {
            const client = browser(runtime)
            assert.equal((await client.login(email, process.env[variable])).status, 200)
            const people = await client.request('GET', '/colab')
            assert.equal(people.status, 200)
            same(people.json().map(row => row.id).sort((a, b) => a - b), ids)
            assert.ok(people.json().every(row => row.gerencia === approval.departments[0].nome && row.demandante === 'reviewer@example.invalid'))
            for (const url of ['/registros', '/registros2?page=1&limit=100']) {
                const response = await client.request('GET', url)
                assert.equal(response.status, 200); assert.equal(response.json().length, 8)
                for (const row of response.json()) {
                    const original = before.registros.find(item => item.id === row.id)
                    assert.equal(row.demandante, original.demandante)
                    assert.equal(row.colab, original.colab)
                    assert.equal(row.updated_at, new Date(original.updated_at).toISOString())
                    assert.equal((await client.request('GET', '/registros/' + row.id)).status, 200)
                }
            }
            const departments = (await client.request('GET', '/gerencias')).json()
            assert.equal(departments.length, 1); assert.equal(departments[0].demandante_id, approval.departments[0].demandante_id)
            assert.equal((await client.request('POST', '/signout', {}, await client.csrf())).status, 204)
        }
        return { anonymousDenied: true, twoProfessionalsVisible: true, eightEvaluationsVisible: true,
            currentDepartmentAndOwnerDerived: true, originalAuthorshipPreserved: true }
    } finally { await runtime.close() }
}

async function activate({ profile, root, verifyServer, database, connectApplication, startApplication, browser,
    approvedMapName, confirmation, recoveryReportName, secret, recoveryKey, progress = () => {} }) {
    await verifyServer(root, profile)
    const match = /^department-map-approved-([a-f0-9]{12})\.evalinventory$/.exec(approvedMapName || '')
    assert.ok(match)
    const approval = decryptDetails(JSON.parse(fs.readFileSync(path.join(profile.directory, approvedMapName), 'utf8')),
        secret, profile.id + ':' + profile.database + ':department-approval:' + match[1], profile.id)
    validateApproval(profile, approval, confirmation)
    const reviewMatch = /^department-map-review-([a-f0-9]{12})\.evalinventory$/.exec(approval.reviewName)
    assert.ok(reviewMatch)
    const rawReview = fs.readFileSync(path.join(profile.directory, approval.reviewName))
    assert.equal(createHash('sha256').update(rawReview).digest('hex'), approval.reviewSha256)
    same(decryptDetails(JSON.parse(rawReview), secret, profile.id + ':' + profile.database + ':department-map:' + reviewMatch[1], profile.id), approval.review)
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../migrations', migration))).digest('hex'), approval.migrationSha256)
    assert.match(recoveryReportName || '', /^recovery-report-[a-f0-9]{12}\.json$/)
    const backup = JSON.parse(fs.readFileSync(path.join(profile.directory, recoveryReportName), 'utf8'))
    const target = recoveryTarget(profile, backup, recoveryReportName)
    assert.ok(Date.parse(backup.completedUtc) > Date.parse(approval.approvedUtc), 'Fresh backup after explicit approval required')
    assert.match(recoveryKey || '', /^[a-f0-9]{64}$/)
    const key = Buffer.from(recoveryKey, 'hex')
    let recovered
    try {
        recovered = unseal(JSON.parse(fs.readFileSync(path.join(profile.directory, backup.encryptedArtifact), 'utf8')), key, profile.id + ':' + profile.database)
    } finally { key.fill(0); if (recovered) recovered.fill(0) }
    const noWriters = async () => {
        const [rows] = await root.query('SELECT ID FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND DB IN (?, ?)', [profile.database, target.name])
        assert.equal(rows.length, 0, 'Suspend source/recovery writers')
    }
    await noWriters()
    for (const name of [profile.database, target.name]) await assertStructure(root, name, 12, profile.id)
    const before = await snapshot(root, profile.database)
    matchesReview(before, approval.review)
    same(await snapshot(root, target.name), before)
    const id = randomBytes(6).toString('hex')
    const manifestName = 'management-activation-manifest-' + id + '.evalinventory'
    fs.writeFileSync(path.join(profile.directory, manifestName), JSON.stringify(encryptDetails({ approvedMapName, recoveryReportName, approval, before }, secret,
        profile.id + ':' + profile.database + ':management-activation:' + id, profile.id)), { flag: 'wx', mode: 0o600 })
    const reportName = 'management-activation-report-' + id + '.json'
    const state = { sourceSchemaAttempted: false, sourceSchemaApplied: false, sourceMapApplied: false, copyVerified: false }
    const checkpoint = phase => {
        fs.writeFileSync(path.join(profile.directory, reportName), JSON.stringify({ phase, ...state, manifestName, approvedMapName, recoveryReportName,
            updatedUtc: new Date().toISOString() }), { flag: phase === 'prepared' ? 'wx' : 'w' })
        progress(phase)
    }
    checkpoint('prepared')
    const applySchema = async name => {
        const db = database({ ...profile, database: name }, 'migrator', name)
        try { await migrateManagementCopy(db) } finally { await db.destroy() }
        await assertStructure(root, name, 13, profile.id)
    }
    const applyMap = async name => {
        const client = await connectApplication({ ...profile, database: name })
        try { await verifyServer(client, profile); return await applyApprovedMap(client, name, before, approval) }
        finally { await client.end() }
    }
    try {
        checkpoint('copy-migration-access')
        await grantCopyMigration(root, profile, target.name)
        checkpoint('copy-schema-and-map')
        await applySchema(target.name)
        const copyResult = await applyMap(target.name)
        const copyHttp = await checkHttp({ profile: { ...profile, database: target.name }, before, approval, startApplication, browser })
        same(await snapshot(root, target.name), expectedState(before, approval, copyResult.departmentId))
        state.copyVerified = true
        checkpoint('source-revalidation')
        await noWriters(); await assertStructure(root, profile.database, 12, profile.id)
        same(await snapshot(root, profile.database), before)
        state.sourceSchemaAttempted = true; checkpoint('source-schema')
        await applySchema(profile.database); state.sourceSchemaApplied = true
        checkpoint('source-map')
        const sourceResult = await applyMap(profile.database); state.sourceMapApplied = true
        same(await snapshot(root, profile.database), expectedState(before, approval, sourceResult.departmentId))
        checkpoint('source-http-verification')
        const sourceHttp = await checkHttp({ profile, before, approval, startApplication, browser })
        same(await snapshot(root, profile.database), expectedState(before, approval, sourceResult.departmentId))
        const report = { success: true, ...state, completedUtc: new Date().toISOString(), reportName, manifestName,
            approvedMapName, recoveryReportName, encryptedBackup: backup.encryptedArtifact, sourceMigrations: 13, departmentsCreated: 1,
            professionalsAssigned: 2, evaluationsPreserved: 8, map: confirmation, departmentName: 'Gerência de Testes',
            accountsUnchanged: true, legacyProfessionalFieldsPreserved: true, copyMigrationAccessScoped: true, copyHttp, sourceHttp, smtpDelivery: false }
        fs.writeFileSync(path.join(profile.directory, reportName), JSON.stringify(report, null, 2))
        return report
    } catch (error) {
        checkpoint('failed')
        const line = error.stack?.match(/isolated-activate-management\.js:(\d+):/)?.[1] || 'UNKNOWN'
        const causeCode = /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'UNKNOWN'
        throw Object.assign(new Error('Management activation failed; preserve artifacts and inspect checkpoint'), { code: 'MANAGEMENT_ACTIVATION_FAILED_' + causeCode + '_AT_' + line })
    }
}

module.exports = { activate, validateApproval, matchesReview, applyApprovedMap, expectedState, grantCopyMigration }
