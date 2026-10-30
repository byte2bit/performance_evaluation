// E1 only: approved fictitious copy. Never bootstraps the app or grants SQL
// privileges. Preflight is read-only. DDL failures preserve the partial copy.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const mysql = require('mysql2/promise')
const knexFactory = require('knex')
const { SOURCE, TARGET, CONFIRMATION, assertScope, staticConnection, grantPrivileges, lockRead, snapshot, assertDump } = require('./local-mysql-copy')
const { encryptDetails, decryptDetails } = require('./isolated-inventory')
const { unseal } = require('./isolated-recovery')
const { authorize, assertAuthorized, ensure, E1_CONFIRMATION } = require('../compat/inova/scope')

const LEDGER = 'inova_compat_migrations'
const managed = ['colab', 'registros', 'users2']
const migrationNames = Object.freeze(['20261029000100_transactional_engines.js', '20261029000200_additive_structures.js'])
const newTables = ['auth_rate_limits', 'gerencias', LEDGER, LEDGER + '_lock', 'sessions'].sort()
const requiredPrivileges = ['CREATE', 'ALTER', 'INDEX', 'REFERENCES', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'LOCK TABLES']
const addedColumns = { users2: ['active', 'session_version'], colab: ['gerencia_id', 'deletedAt'], registros: ['colab_id'] }
const migrationPath = name => path.join(__dirname, '../compat/inova/migrations', name)
const digest = rows => createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex')
const lockName = 'evaluation:inova-compat:20261029:e1'

function migrationSource(checkpoint = async () => {}) {
    return {
        getMigrations: async () => [...migrationNames],
        getMigrationName: name => { ensure(migrationNames.includes(name), 'E1_MIGRATION_NOT_APPROVED'); return name },
        getMigration: async name => {
            ensure(migrationNames.includes(name), 'E1_MIGRATION_NOT_APPROVED')
            const migration = require(migrationPath(name))
            return { config: migration.config, down: migration.down, up: async knex => {
                await migration.up(knex)
                await checkpoint(name)
            } }
        }
    }
}

function verifyBaseline(profile, manifest) {
    ensure(manifest.profileId === profile.id && manifest.source === SOURCE && manifest.target === TARGET &&
        manifest.serverUuid === profile.serverUuid, 'E1_BASELINE_IDENTITY_CHANGED')
    const tables = Object.keys(manifest.before || {}).sort()
    ensure(tables.length === 9 && tables.every(name => /^[a-zA-Z0-9_]+$/.test(name)) &&
        ['users2', 'colab', 'registros', 'migrations', 'migrations_lock'].every(name => tables.includes(name)) &&
        !newTables.some(name => tables.includes(name)), 'E1_BASELINE_TABLES_CHANGED')
    ensure(manifest.before.users2.count === 25 && manifest.before.colab.count === 100 && manifest.before.registros.count === 498 &&
        manifest.before.migrations.count === 7 && Object.values(manifest.before).reduce((sum, row) => sum + row.count, 0) === 680 &&
        Object.values(manifest.before).every(row => /\bENGINE=MyISAM\b/.test(row.ddl) && /^[a-f0-9]{64}$/.test(row.digest)), 'E1_BASELINE_CHANGED')
    return tables
}

async function catalog(db) {
    const [tables] = await db.query('SELECT TABLE_NAME AS name, TABLE_TYPE AS type, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', [TARGET])
    const [columns] = await db.query('SELECT TABLE_NAME AS t,COLUMN_NAME AS name,COLUMN_TYPE AS type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS def,EXTRA AS extra,COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,ORDINAL_POSITION', [TARGET])
    const [indexes] = await db.query('SELECT TABLE_NAME AS t,INDEX_NAME AS name,COLUMN_NAME AS columnName,SEQ_IN_INDEX AS position,NON_UNIQUE AS nonUnique,SUB_PART AS prefixLength,INDEX_TYPE AS type FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX', [TARGET])
    const [foreignKeys] = await db.query('SELECT k.TABLE_NAME AS t,k.COLUMN_NAME AS c,k.REFERENCED_TABLE_SCHEMA AS parentSchema,k.REFERENCED_TABLE_NAME AS parent,k.REFERENCED_COLUMN_NAME AS parentColumn,r.UPDATE_RULE AS onUpdate,r.DELETE_RULE AS onDelete FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=? ORDER BY k.TABLE_NAME,k.COLUMN_NAME', [TARGET])
    return { tables, columns, indexes, foreignKeys }
}

function verifyCatalogBefore(before, tables) {
    assert.deepEqual(before.tables.map(row => row.name), tables)
    ensure(before.tables.every(row => row.type === 'BASE TABLE' && row.engine === 'MyISAM') && !before.foreignKeys.length, 'E1_COPY_SCHEMA_CHANGED')
    for (const table of managed) {
        ensure(!before.columns.some(column => column.t === table && addedColumns[table].includes(column.name)), 'E1_COLUMN_ALREADY_EXISTS')
        const id = before.columns.find(column => column.t === table && column.name === 'id')
        ensure(id?.type === 'int unsigned' && id.nullable === 'NO', 'E1_ID_TYPE_CHANGED')
    }
}

function verifyCatalogAfter(before, after, stage) {
    const additive = stage === 'structures'
    const expectedNewTables = additive ? newTables : [LEDGER, LEDGER + '_lock']
    assert.deepEqual(after.tables.map(row => row.name), [...before.tables.map(row => row.name), ...expectedNewTables].sort())
    for (const table of before.tables) {
        const actual = after.tables.find(row => row.name === table.name)
        assert.deepEqual(actual, { ...table, engine: managed.includes(table.name) ? 'InnoDB' : table.engine })
    }
    ensure(after.tables.filter(row => newTables.includes(row.name)).every(row => row.engine === 'InnoDB'), 'E1_NEW_TABLE_ENGINE_CHANGED')
    const oldNames = new Set(before.columns.map(row => row.t + '.' + row.name))
    assert.deepEqual(after.columns.filter(row => oldNames.has(row.t + '.' + row.name)), before.columns)
    const oldIndexes = new Set(before.indexes.map(row => row.t + '.' + row.name))
    assert.deepEqual(after.indexes.filter(row => oldIndexes.has(row.t + '.' + row.name)), before.indexes)
    const expectedAdded = additive ? Object.entries(addedColumns).flatMap(([table, names]) => names.map(name => table + '.' + name)).sort() : []
    assert.deepEqual(after.columns.filter(row => managed.includes(row.t) && !oldNames.has(row.t + '.' + row.name)).map(row => row.t + '.' + row.name).sort(), expectedAdded)
    if (!additive) { assert.deepEqual(after.foreignKeys, []); return }
    const expectColumn = (table, name, type, nullable, def) => {
        const actual = after.columns.find(row => row.t === table && row.name === name)
        ensure(actual?.type === type && actual.nullable === nullable && actual.def === def, 'E1_COLUMN_CONTRACT_CHANGED')
    }
    expectColumn('users2', 'active', 'tinyint(1)', 'NO', '0')
    expectColumn('users2', 'session_version', 'int unsigned', 'NO', '0')
    expectColumn('colab', 'gerencia_id', 'int unsigned', 'YES', null)
    expectColumn('colab', 'deletedAt', 'timestamp', 'YES', null)
    expectColumn('registros', 'colab_id', 'int unsigned', 'YES', null)
    expectColumn('sessions', 'sid', 'varchar(255)', 'NO', null)
    expectColumn('sessions', 'sess', 'json', 'NO', null)
    expectColumn('sessions', 'expired', 'datetime', 'NO', null)
    expectColumn('auth_rate_limits', 'key', 'varchar(255)', 'NO', null)
    expectColumn('auth_rate_limits', 'points', 'int', 'NO', '0')
    expectColumn('auth_rate_limits', 'expire', 'bigint unsigned', 'YES', null)
    expectColumn('gerencias', 'demandante_id', 'int unsigned', 'NO', null)
    assert.deepEqual(after.foreignKeys, [
        { t: 'colab', c: 'gerencia_id', parentSchema: TARGET, parent: 'gerencias', parentColumn: 'id', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' },
        { t: 'gerencias', c: 'demandante_id', parentSchema: TARGET, parent: 'users2', parentColumn: 'id', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' },
        { t: 'registros', c: 'colab_id', parentSchema: TARGET, parent: 'colab', parentColumn: 'id', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' }
    ])
    for (const [table, name, columns] of [
        ['colab', 'colab_gerencia_active_index', ['gerencia_id', 'deletedAt']],
        ['registros', 'registros_colab_id_index', ['colab_id']],
        ['sessions', 'sessions_expired_index', ['expired']],
        ['auth_rate_limits', 'auth_rate_limits_expire_index', ['expire']]
    ]) assert.deepEqual(after.indexes.filter(row => row.t === table && row.name === name).map(row => row.columnName), columns)
}

async function assertExclusive(db, permittedIds) {
    const [threads] = await db.query("SELECT PROCESSLIST_ID AS id,PROCESSLIST_DB AS db FROM performance_schema.threads WHERE TYPE='FOREGROUND' AND PROCESSLIST_ID IS NOT NULL")
    ensure(threads.some(row => permittedIds.includes(Number(row.id))), 'E1_SESSION_VISIBILITY_REQUIRED')
    ensure(threads.filter(row => row.db === TARGET).every(row => permittedIds.includes(Number(row.id))), 'E1_OTHER_COPY_CONNECTION')
    const [locks] = await db.query('SELECT t.PROCESSLIST_ID AS id FROM performance_schema.metadata_locks l JOIN performance_schema.threads t ON t.THREAD_ID=l.OWNER_THREAD_ID WHERE l.OBJECT_SCHEMA=?', [TARGET])
    ensure(locks.every(row => permittedIds.includes(Number(row.id))), 'E1_OTHER_COPY_LOCK')
    const [[owner]] = await db.query('SELECT IS_USED_LOCK(?) AS id', [lockName])
    ensure(Number(owner.id) === permittedIds[0], 'E1_CONTROL_LOCK_LOST')
}

async function verifyHistorical(db, baseline, before, stage) {
    const tables = Object.keys(baseline).sort()
    await lockRead(db, TARGET, tables)
    try {
        for (const table of tables) {
            const names = before.columns.filter(row => row.t === table).map(row => row.name)
            ensure(names.length > 0, 'E1_BASELINE_COLUMNS_REQUIRED')
            const [rows] = await db.query('SELECT ' + names.map(() => '??').join(',') + ' FROM ??.??', [...names, TARGET, table])
            ensure(rows.length === baseline[table].count && digest(rows) === baseline[table].digest, 'E1_HISTORICAL_CONTENT_CHANGED')
            const [[definition]] = await db.query('SHOW CREATE TABLE ??.??', [TARGET, table])
            const ddl = definition['Create Table']
            if (!managed.includes(table)) assert.equal(ddl, baseline[table].ddl)
            else if (stage === 'engines') assert.equal(ddl.replace('ENGINE=InnoDB', 'ENGINE=MyISAM'), baseline[table].ddl)
        }
    } finally { await db.query('UNLOCK TABLES') }
}

async function verifyEmptyAdditions(db) {
    for (const table of ['gerencias', 'sessions', 'auth_rate_limits']) {
        const [[row]] = await db.query('SELECT COUNT(*) AS total FROM ??.??', [TARGET, table])
        ensure(Number(row.total) === 0, 'E1_UNEXPECTED_NEW_DATA')
    }
    for (const [table, clause] of [['users2', 'active<>0 OR session_version<>0'], ['colab', 'gerencia_id IS NOT NULL OR deletedAt IS NOT NULL'], ['registros', 'colab_id IS NOT NULL']]) {
        const [[row]] = await db.query('SELECT COUNT(*) AS total FROM ??.?? WHERE ' + clause, [TARGET, table])
        ensure(Number(row.total) === 0, 'E1_UNEXPECTED_ASSIGNMENTS')
    }
}

async function transactionProbes(db) {
    // Only the copy; all successful updates are reverted before returning.
    const ids = {}
    for (const table of managed) {
        const [[row]] = await db.query('SELECT MIN(id) AS id FROM ??.??', [TARGET, table])
        ensure(row.id != null, 'E1_PROBE_ROW_MISSING'); ids[table] = row.id
    }
    await db.beginTransaction()
    try {
        await db.query('UPDATE ??.users2 SET session_version=1 WHERE id=?', [TARGET, ids.users2])
        await db.query('UPDATE ??.colab SET deletedAt=CURRENT_TIMESTAMP WHERE id=?', [TARGET, ids.colab])
        await db.query('UPDATE ??.registros SET updated_at=DATE_ADD(updated_at,INTERVAL 1 SECOND) WHERE id=?', [TARGET, ids.registros])
        const [[row]] = await db.query('SELECT session_version FROM ??.users2 WHERE id=?', [TARGET, ids.users2])
        ensure(Number(row.session_version) === 1, 'E1_PROBE_UPDATE_FAILED')
        for (const [table, column] of [['colab', 'gerencia_id'], ['registros', 'colab_id']]) {
            let rejected = false
            try { await db.query('UPDATE ??.?? SET ??=4294967295 WHERE id=?', [TARGET, table, column, ids[table]]) }
            catch (error) { if (error.code !== 'ER_NO_REFERENCED_ROW_2') throw error; rejected = true }
            ensure(rejected, 'E1_FOREIGN_KEY_PROBE_FAILED')
        }
    } finally { await db.rollback() }
    await verifyEmptyAdditions(db)
    return { transactionRolledBack: true, invalidChildUpdatesRejected: 2 }
}

async function createLedger(knex) {
    await knex.schema.withSchema(TARGET).createTable(LEDGER, table => {
        table.engine('InnoDB'); table.increments('id'); table.string('name'); table.integer('batch'); table.timestamp('migration_time')
    })
    await knex.schema.withSchema(TARGET).createTable(LEDGER + '_lock', table => {
        table.engine('InnoDB'); table.increments('index').primary(); table.integer('is_locked')
    })
    await knex.withSchema(TARGET).table(LEDGER + '_lock').insert({ is_locked: 0 })
}

async function connect(config, database = TARGET) {
    return mysql.createConnection({ ...config, database, connectTimeout: 3000, multipleStatements: false,
        debug: false, trace: false, charset: 'utf8mb4', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true })
}

async function run({ action, profile, config, directory, confirmation, secret, backupKey, stage = () => {},
    storage = fs, connector = connect, factory = knexFactory }) {
    ensure(['preflight', 'apply'].includes(action), 'E1_ACTION_UNSUPPORTED')
    assertScope(profile, CONFIRMATION)
    ensure(confirmation === E1_CONFIRMATION, 'E1_CONFIRMATION_REQUIRED')
    ensure(config.host === '127.0.0.1' && config.port === 3306 && config.database === SOURCE, 'E1_CONFIG_NOT_APPROVED')
    ensure(/^[a-f0-9]{64}$/.test(secret || '') && Buffer.isBuffer(backupKey) && backupKey.length === 32, 'E1_KEYS_REQUIRED')
    const artifactNames = ['compat-e1-before.evalinventory', 'compat-e1-engines.evalinventory', 'compat-e1-structures.evalinventory', 'compat-e1-report.json', 'compat-e1-failure.json']
    ensure(artifactNames.every(name => !storage.existsSync(path.join(directory, name))), 'E1_EXISTING_EXECUTION_ARTIFACT')
    const identity = profile.id + ':' + SOURCE + ':' + TARGET
    const manifest = decryptDetails(JSON.parse(storage.readFileSync(path.join(directory, 'manifest.evalinventory'), 'utf8')), secret, identity, profile.id)
    const tables = verifyBaseline(profile, manifest)
    const dump = unseal(JSON.parse(storage.readFileSync(path.join(directory, 'backup.evalbackup'), 'utf8')), backupKey, profile.id + ':' + SOURCE)
    try { assertDump(dump, tables) } finally { dump.fill(0) }
    let db, source, knex, controlLocked = false, beganDdl = false, currentStage = 'preflight'
    const encrypted = (name, details) => storage.writeFileSync(path.join(directory, name), JSON.stringify(encryptDetails(details, secret, identity + ':e1:' + name, profile.id)), { flag: 'wx', mode: 0o600 })
    const mark = value => { currentStage = value; stage(value) }
    try {
        db = await connector(config, TARGET)
        const [[server]] = await db.query('SELECT DATABASE() AS name,@@port AS port,@@server_uuid AS uuid,VERSION() AS version,CONNECTION_ID() AS id')
        ensure(server.name === TARGET && Number(server.port) === 3306 && server.uuid === profile.serverUuid && server.version === '8.0.44', 'E1_SERVER_CHANGED')
        const [[control]] = await db.query('SELECT GET_LOCK(?,0) AS acquired', [lockName])
        ensure(Number(control.acquired) === 1, 'E1_CONTROL_LOCK_BUSY'); controlLocked = true
        const permitted = [Number(server.id)]
        await assertExclusive(db, permitted)
        const [grants] = await db.query('SHOW GRANTS')
        const allows = grantPrivileges(grants, TARGET)
        const missingPrivileges = requiredPrivileges.filter(privilege => !allows(privilege))
        const before = await catalog(db)
        verifyCatalogBefore(before, tables)
        for (const [catalogName, schemaColumn] of [['TRIGGERS', 'TRIGGER_SCHEMA'], ['ROUTINES', 'ROUTINE_SCHEMA'], ['EVENTS', 'EVENT_SCHEMA']]) {
            const [[row]] = await db.query('SELECT COUNT(*) AS count FROM information_schema.?? WHERE ??=?', [catalogName, schemaColumn, TARGET])
            ensure(Number(row.count) === 0, 'E1_UNEXPECTED_DATABASE_OBJECT')
        }
        await lockRead(db, TARGET, tables)
        try { assert.deepEqual(await snapshot(db, TARGET, tables), manifest.before) }
        finally { await db.query('UNLOCK TABLES') }
        source = await connector(config, SOURCE)
        await lockRead(source, SOURCE, tables)
        try { assert.deepEqual(await snapshot(source, SOURCE, tables), manifest.before) }
        finally { await source.query('UNLOCK TABLES') }
        const preflight = { success: true, ready: !missingPrivileges.length, action: 'preflight', target: TARGET,
            mysqlVersion: server.version, backupAuthenticated: true, copyMatchesBaseline: true, sourceMatchesBaseline: true,
            originalTables: 9, originalRows: 680, coreCounts: { users2: 25, colab: 100, registros: 498 },
            legacyMigrationEntries: 7, missingPrivileges, otherCopyConnections: 0, ddlExecuted: false,
            migrationsExecuted: 0, privilegesChanged: false, applicationSwitched: false, completedUtc: new Date().toISOString() }
        if (action === 'preflight') return preflight
        ensure(preflight.ready, 'E1_REQUIRED_PRIVILEGES_MISSING')
        await assertExclusive(db, permitted)
        encrypted('compat-e1-before.evalinventory', { profileId: profile.id, target: TARGET, baseline: manifest.before, before,
            migrations: migrationNames.map(name => ({ name, sha256: createHash('sha256').update(storage.readFileSync(migrationPath(name))).digest('hex') })) })
        // Dedicated client, never the application knexfile. Suppress driver/Knex
        // diagnostics: SQL errors can contain values from fictitious accounts.
        knex = factory({ client: 'mysql', connection: { ...config, database: TARGET, multipleStatements: false, dateStrings: true },
            pool: { min: 0, max: 1 }, acquireConnectionTimeout: 5000, log: { warn() {}, error() {}, debug() {}, deprecate() {} } })
        authorize(knex, profile, confirmation)
        const [[worker]] = await knex.raw('SELECT CONNECTION_ID() AS id')
        permitted.push(Number(worker.id)); await assertExclusive(db, permitted)
        await knex.raw('SET SESSION lock_wait_timeout=5')
        await knex.raw('SET SESSION innodb_lock_wait_timeout=5')
        await assertAuthorized(knex)
        mark('create-private-ledger'); beganDdl = true
        await createLedger(knex)
        const checkpoint = async name => {
            await assertExclusive(db, permitted)
            const phase = name === migrationNames[0] ? 'engines' : 'structures'
            const after = await catalog(db)
            verifyCatalogAfter(before, after, phase)
            await verifyHistorical(db, manifest.before, before, phase)
            if (phase === 'structures') await verifyEmptyAdditions(db)
            encrypted('compat-e1-' + phase + '.evalinventory', { profileId: profile.id, target: TARGET, after, historicalContentMatches: true })
            mark('verified-' + phase)
        }
        mark('apply-two-approved-migrations')
        const [batch, applied] = await knex.migrate.latest({ tableName: LEDGER, schemaName: TARGET,
            disableTransactions: true, migrationSource: migrationSource(checkpoint) })
        ensure(batch === 1, 'E1_UNEXPECTED_MIGRATION_BATCH'); assert.deepEqual(applied, migrationNames)
        const [entries] = await db.query('SELECT name,batch FROM ??.?? ORDER BY id', [TARGET, LEDGER])
        assert.deepEqual(entries, migrationNames.map(name => ({ name, batch: 1 })))
        mark('transaction-and-foreign-key-probes')
        await assertExclusive(db, permitted)
        const probes = await transactionProbes(db)
        await verifyHistorical(db, manifest.before, before, 'structures')
        await lockRead(source, SOURCE, tables)
        try { assert.deepEqual(await snapshot(source, SOURCE, tables), manifest.before) }
        finally { await source.query('UNLOCK TABLES') }
        const report = { success: true, target: TARGET, migrationsExecuted: 2, dedicatedLedger: LEDGER,
            managedEngines: 'InnoDB', originalTables: 9, originalRows: 680, coreCounts: preflight.coreCounts,
            legacyMigrationEntries: 7, legacyLedgerUnchanged: true, historicalFieldsAndHashesPreserved: true,
            otherSixTablesUnchanged: true, sourceUnchanged: true, accountsActive: 0, assignmentsApplied: 0,
            restrictiveForeignKeys: 3, ...probes, privilegesChanged: false, applicationSwitched: false,
            copyPreserved: true, completedUtc: new Date().toISOString() }
        storage.writeFileSync(path.join(directory, 'compat-e1-report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
        return report
    } catch (error) {
        if (beganDdl) storage.writeFileSync(path.join(directory, 'compat-e1-failure.json'), JSON.stringify({ success: false,
            stage: currentStage, partialDdlPossible: true, target: TARGET, copyPreserved: true, automaticRollbackOrRetry: false }), { flag: 'wx', mode: 0o600 })
        throw error
    } finally {
        try { if (knex) await knex.destroy() }
        finally {
            try { if (controlLocked) await db.query('SELECT RELEASE_LOCK(?)', [lockName]) }
            finally { source?.destroy(); db?.destroy() }
        }
    }
}

let currentStage = 'configuration'
async function main() {
    const directory = fs.realpathSync(process.argv[3])
    const expected = path.resolve(process.env.LOCALAPPDATA || '', 'EvaluationDev/inova-nucleo-compat-20261029')
    ensure(directory.toLowerCase() === expected.toLowerCase(), 'E1_DIRECTORY_NOT_APPROVED')
    const profile = JSON.parse(fs.readFileSync(path.join(directory, 'profile.json'), 'utf8').replace(/^\uFEFF/, ''))
    const config = staticConnection(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8'))
    ensure(/^[a-f0-9]{64}$/.test(process.env.EVAL_LOCAL_COPY_BACKUP_KEY || ''), 'E1_KEYS_REQUIRED')
    const backupKey = Buffer.from(process.env.EVAL_LOCAL_COPY_BACKUP_KEY, 'hex')
    try {
        console.log(JSON.stringify(await run({ action: process.argv[2], profile, config, directory, backupKey,
            confirmation: process.env.EVAL_LOCAL_COMPAT_CONFIRMATION, secret: process.env.EVAL_LOCAL_COPY_INVENTORY_SECRET,
            stage(value) { currentStage = value; console.log(JSON.stringify({ stage: value })) } })))
    } finally { backupKey.fill(0) }
}
if (require.main === module) main().catch(error => {
    const line = error.stack?.match(/local-mysql-compat\.js:(\d+):\d+/)?.[1]
    console.error(JSON.stringify({ success: false, stage: currentStage,
        code: /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'E1_COMPATIBILITY_FAILED',
        ...(line ? { location: Number(line) } : {}), privateDiagnosticsSuppressed: true }))
    process.exitCode = 1
})
module.exports = { run, migrationSource, migrationNames, newTables, requiredPrivileges, addedColumns,
    verifyBaseline, verifyCatalogBefore, verifyCatalogAfter, assertExclusive, verifyHistorical, transactionProbes, LEDGER, E1_CONFIRMATION,
    catalog, verifyEmptyAdditions }
