const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { randomBytes, createHash } = require('node:crypto')
const knexFactory = require('knex')
const { seal } = require('../scripts/isolated-recovery')
const { encryptDetails } = require('../scripts/isolated-inventory')
const { SOURCE, TARGET } = require('../scripts/local-mysql-copy')
const { authorize, assertAuthorized } = require('../compat/inova/scope')
const { run, migrationSource, migrationNames, newTables, requiredPrivileges, verifyBaseline,
    verifyCatalogBefore, verifyCatalogAfter, assertExclusive, verifyHistorical, transactionProbes, LEDGER, E1_CONFIRMATION } = require('../scripts/local-mysql-compat')

const profile = { kind: 'evaluation-local-mysql-copy-v1', id: 'a'.repeat(32), host: '127.0.0.1', port: 3306,
    source: SOURCE, target: TARGET, serverUuid: '00000000-0000-0000-0000-000000000001' }
const config = { host: '127.0.0.1', port: 3306, database: SOURCE, user: 'synthetic_sql_user', password: 'synthetic_client_secret' }
const tables = ['colab', 'migrations', 'migrations_lock', 'petro', 'petrousers', 'registros', 'sbc_users', 'users', 'users2']
const counts = { colab: 100, migrations: 7, migrations_lock: 1, petro: 49, petrousers: 0, registros: 498, sbc_users: 0, users: 0, users2: 25 }
const content = Object.fromEntries(tables.map(table => [table, Array.from({ length: counts[table] }, (_, i) =>
    table === 'users2' ? { id: i + 1, password: 'synthetic_bcrypt_fixture_' + i } : { id: i + 1 })]))
const digest = rows => createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex')
const baseline = Object.fromEntries(tables.map(table => [table, { count: counts[table],
    ddl: 'CREATE TABLE `' + table + '` (`id` int unsigned) ENGINE=MyISAM', digest: digest(content[table]) }]))
const manifest = { profileId: profile.id, source: SOURCE, target: TARGET, serverUuid: profile.serverUuid, before: baseline }
const column = (t, name, type = 'int unsigned', nullable = 'NO', def = null) => ({ t, name, type, nullable, def, extra: '', collation: null })
const before = { tables: tables.map(name => ({ name, type: 'BASE TABLE', engine: 'MyISAM', collation: 'utf8mb3_general_ci' })),
    columns: tables.flatMap(table => [column(table, 'id'), ...(table === 'users2' ? [column(table, 'password', 'varchar(255)')] : [])]),
    indexes: tables.map(t => ({ t, name: 'PRIMARY', columnName: 'id', position: 1, nonUnique: 0, prefixLength: null, type: 'BTREE' })), foreignKeys: [] }

function harness({ missingReferences = true, wrongServer = false, changedCopy = false, otherClient = false, existingArtifact = false } = {}) {
    const directory = path.resolve('synthetic-e1-fixture'), files = new Map(), queries = []
    const secret = randomBytes(32).toString('hex'), backupKey = randomBytes(32)
    const identity = profile.id + ':' + SOURCE + ':' + TARGET
    files.set(path.join(directory, 'manifest.evalinventory'), JSON.stringify(encryptDetails(manifest, secret, identity, profile.id)))
    const dump = Buffer.from(tables.map(table => 'CREATE TABLE `' + table + '` (id int);').join('\n'))
    files.set(path.join(directory, 'backup.evalbackup'), JSON.stringify(seal(dump, backupKey, profile.id + ':' + SOURCE)))
    if (existingArtifact) files.set(path.join(directory, 'compat-e1-before.evalinventory'), 'preserved-artifact')
    let connections = 0, destroyed = 0, factoryCalls = 0
    const storage = { existsSync: file => files.has(file), readFileSync: file => { assert.ok(files.has(file)); return files.get(file) },
        writeFileSync() { assert.fail('Blocked/preflight runs must not write an execution artifact') } }
    const args = { action: 'preflight', profile, config, directory, confirmation: E1_CONFIRMATION, secret, backupKey, storage,
        factory() { factoryCalls++; assert.fail('Knex must not be constructed before preflight readiness') },
        async connector(connection, schema) {
            connections++
            assert.deepEqual(connection, config)
            return { destroy() { destroyed++ }, async query(input, bindings = []) {
                const sql = typeof input === 'string' ? input : input.sql
                queries.push({ sql, bindings, schema })
                assert.match(sql, /^(SELECT|SHOW|SET SESSION|LOCK TABLES|UNLOCK TABLES)/)
                if (sql.includes('VERSION()')) return [[{ name: TARGET, port: 3306, uuid: wrongServer ? 'other' : profile.serverUuid, version: '8.0.44', id: 41 }]]
                if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]
                if (sql.includes('IS_USED_LOCK')) return [[{ id: 41 }]]
                if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]]
                if (sql.includes('performance_schema.metadata_locks')) return [[]]
                if (sql.includes('performance_schema.threads')) return [[{ id: 41, db: TARGET }, ...(otherClient ? [{ id: 42, db: TARGET }] : [])]]
                if (sql === 'SHOW GRANTS') return [[{ grants: 'GRANT ' + requiredPrivileges.filter(p => !missingReferences || p !== 'REFERENCES').join(', ') + ' ON *.* TO synthetic' }]]
                if (sql.includes('information_schema.TABLES')) return [before.tables]
                if (sql.includes('information_schema.COLUMNS')) return [before.columns]
                if (sql.includes('information_schema.STATISTICS')) return [before.indexes]
                if (sql.includes('information_schema.KEY_COLUMN_USAGE')) return [[]]
                if (sql.startsWith('SELECT COUNT(*) AS count FROM information_schema.??')) return [[{ count: 0 }]]
                if (sql.startsWith('SELECT COUNT(*) AS count FROM ??.??')) return [[{ count: counts[bindings[1]] }]]
                if (sql.startsWith('SHOW CREATE TABLE')) return [[{ 'Create Table': baseline[bindings[1]].ddl }]]
                if (sql.startsWith('SELECT * FROM')) {
                    const rows = content[bindings[1]]
                    return [changedCopy && schema === TARGET && rows.length ? rows.map((row, i) => i ? row : { ...row, id: -1 }) : rows]
                }
                assert.match(sql, /^(SET SESSION|LOCK TABLES|UNLOCK TABLES)/); return [[]]
            } }
        } }
    return { args, files, queries, get connections() { return connections }, get destroyed() { return destroyed }, get factoryCalls() { return factoryCalls } }
}

test('E1 scope/confirmation guards reject source, another copy/port and missing approval before connecting', async () => {
    for (const change of [{ confirmation: '' }, { profile: { ...profile, target: SOURCE } },
        { profile: { ...profile, target: 'other_copy' } }, { config: { ...config, port: 50470 } }]) {
        const h = harness()
        await assert.rejects(run({ ...h.args, ...change }))
        assert.equal(h.connections, 0); h.args.backupKey.fill(0)
    }
})

test('preflight authenticates backup/manifest, compares source and copy, and reports missing REFERENCES without writes', async () => {
    const h = harness(), report = await run(h.args)
    assert.equal(report.success, true); assert.equal(report.ready, false)
    assert.deepEqual(report.missingPrivileges, ['REFERENCES'])
    assert.equal(report.backupAuthenticated, true); assert.equal(report.copyMatchesBaseline, true)
    assert.equal(report.sourceMatchesBaseline, true); assert.equal(report.ddlExecuted, false)
    assert.equal(report.migrationsExecuted, 0); assert.equal(h.files.size, 2)
    assert.equal(h.connections, 2); assert.equal(h.destroyed, 2); assert.equal(h.factoryCalls, 0)
    assert.equal(h.queries.some(row => /^(ALTER|CREATE|GRANT|UPDATE|INSERT|DELETE|DROP)/.test(row.sql)), false)
    h.args.backupKey.fill(0)
})

test('apply refuses missing REFERENCES before ledger, execution files, Knex or the first DDL', async () => {
    const h = harness()
    await assert.rejects(run({ ...h.args, action: 'apply' }), { code: 'E1_REQUIRED_PRIVILEGES_MISSING' })
    assert.equal(h.factoryCalls, 0); assert.equal(h.files.size, 2); assert.equal(h.destroyed, 2)
    h.args.backupKey.fill(0)
})

test('a ready preflight remains read-only and does not implicitly apply migrations', async () => {
    const h = harness({ missingReferences: false }), report = await run(h.args)
    assert.equal(report.ready, true); assert.deepEqual(report.missingPrivileges, [])
    assert.equal(report.ddlExecuted, false); assert.equal(h.factoryCalls, 0); assert.equal(h.files.size, 2)
    h.args.backupKey.fill(0)
})

test('server mismatch, changed copy, competing connection and existing artifacts abort instead of retrying or deleting', async () => {
    for (const issue of ['wrongServer', 'changedCopy', 'otherClient', 'existingArtifact']) {
        const h = harness({ [issue]: true })
        await assert.rejects(run({ ...h.args, action: 'apply' }))
        assert.equal(h.factoryCalls, 0); assert.equal(h.destroyed, h.connections)
        assert.equal(h.files.size, issue === 'existingArtifact' ? 3 : 2)
        if (issue === 'existingArtifact') assert.equal(h.connections, 0)
        h.args.backupKey.fill(0)
    }
})

test('tampered encrypted backup and manifest cannot reach a database connection', async () => {
    for (const artifact of ['manifest.evalinventory', 'backup.evalbackup']) {
        const h = harness(), file = path.join(h.args.directory, artifact), data = JSON.parse(h.files.get(file))
        data.tag = '00'.repeat(16); h.files.set(file, JSON.stringify(data))
        await assert.rejects(run(h.args)); assert.equal(h.connections, 0)
        h.args.backupKey.fill(0)
    }
})

test('baseline verification rejects another profile, altered ledger/counts and transactional engines before migration', () => {
    assert.deepEqual(verifyBaseline(profile, manifest), tables)
    for (const value of [{ ...manifest, target: SOURCE }, { ...manifest, profileId: 'b'.repeat(32) },
        { ...manifest, before: { ...baseline, migrations: { ...baseline.migrations, count: 14 } } },
        { ...manifest, before: { ...baseline, users2: { ...baseline.users2, ddl: 'ENGINE=InnoDB' } } }]) {
        assert.throws(() => verifyBaseline(profile, value))
    }
    verifyCatalogBefore(before, tables)
    assert.throws(() => verifyCatalogBefore({ ...before, columns: [...before.columns, column('colab', 'gerencia_id')] }, tables))
})

test('SQL compilation changes only three engines and adds the approved structures with target-qualified restrictive FKs', async () => {
    const knex = knexFactory({ client: 'mysql' })
    try {
        const engine = require('../compat/inova/migrations/' + migrationNames[0])
        const addition = require('../compat/inova/migrations/' + migrationNames[1])
        const sql = migration => migration.changes(knex).flatMap(builder => builder.toSQL()).map(query => query.sql)
        assert.deepEqual(sql(engine), ['users2', 'colab', 'registros'].map(table => 'ALTER TABLE `' + TARGET + '`.`' + table + '` ENGINE=InnoDB'))
        const statements = sql(addition), text = statements.join('\n')
        assert.equal(statements.filter(statement => /^create table /i.test(statement)).length, 3)
        assert.equal(statements.filter(statement => /foreign key/i.test(statement)).length, 3)
        for (const statement of statements) {
            assert.match(statement, new RegExp('`' + TARGET + '`\\.'))
            assert.doesNotMatch(statement, /\b(drop|truncate|delete|insert|update|modify|change|convert|grant|revoke)\b(?! RESTRICT)/i)
            if (/foreign key/i.test(statement)) assert.match(statement, /on update RESTRICT on delete RESTRICT$/)
        }
        assert.match(text, /add `active` boolean not null default '0'/)
        assert.match(text, /add `session_version` int unsigned not null default '0'/)
        assert.match(text, /add `gerencia_id` int unsigned null/)
        assert.match(text, /add `colab_id` int unsigned null/)
        assert.doesNotMatch(text, /password|obs_|itensQualidade|itensDispon|CHARSET|COLLATE/)
        for (const migration of [engine, addition]) {
            assert.equal(migration.config.transaction, false)
            await assert.rejects(migration.up(knex), { code: 'E1_RUNNER_REQUIRED' })
            await assert.rejects(migration.down())
        }
    } finally { await knex.destroy() }
})

test('migration source accepts exactly the two E1 files and never the shared historical chain', async () => {
    const source = migrationSource(), names = await source.getMigrations()
    assert.deepEqual(names, migrationNames)
    names.push('not-approved.js'); assert.deepEqual(await source.getMigrations(), migrationNames)
    assert.throws(() => source.getMigrationName('20261028000100_require_colab_gerencia.js'))
    await assert.rejects(source.getMigration('20261025000100_add_auth_state_to_users2.js'))
    assert.equal(source.getMigrationName(migrationNames[0]), migrationNames[0])
})

test('migration capability requires the runner, approved database and matching live server identity', async () => {
    const knex = { client: { config: { connection: { ...config, database: TARGET } } }, userParams: {},
        async raw() { return [[{ name: TARGET, port: 3306, uuid: profile.serverUuid, version: '8.0.44' }]] } }
    await assert.rejects(assertAuthorized(knex), { code: 'E1_RUNNER_REQUIRED' })
    assert.throws(() => authorize(knex, profile, ''), { code: 'E1_CONFIRMATION_REQUIRED' })
    authorize(knex, profile, E1_CONFIRMATION); await assertAuthorized(knex)
    knex.client.config.connection.database = SOURCE
    await assert.rejects(assertAuthorized(knex), { code: 'E1_TARGET_NOT_APPROVED' })
    knex.client.config.connection.database = TARGET
    knex.raw = async () => [[{ name: TARGET, port: 3306, uuid: 'wrong', version: '8.0.44' }]]
    await assert.rejects(assertAuthorized(knex), { code: 'E1_SERVER_CHANGED' })
})

function afterCatalog(stage) {
    const after = structuredClone(before), additions = stage === 'structures'
    after.tables.forEach(row => { if (['colab', 'registros', 'users2'].includes(row.name)) row.engine = 'InnoDB' })
    after.tables.push(...(additions ? newTables : [LEDGER, LEDGER + '_lock']).map(name => ({ name, type: 'BASE TABLE', engine: 'InnoDB', collation: 'utf8mb4_0900_ai_ci' })))
    after.tables.sort((a, b) => a.name < b.name ? -1 : 1)
    if (!additions) return after
    const added = [column('users2', 'active', 'tinyint(1)', 'NO', '0'), column('users2', 'session_version', 'int unsigned', 'NO', '0'),
        column('colab', 'gerencia_id', 'int unsigned', 'YES'), column('colab', 'deletedAt', 'timestamp', 'YES'), column('registros', 'colab_id', 'int unsigned', 'YES'),
        column('sessions', 'sid', 'varchar(255)'), column('sessions', 'sess', 'json'), column('sessions', 'expired', 'datetime'),
        column('auth_rate_limits', 'key', 'varchar(255)'), column('auth_rate_limits', 'points', 'int', 'NO', '0'), column('auth_rate_limits', 'expire', 'bigint unsigned', 'YES'),
        column('gerencias', 'demandante_id')]
    after.columns = after.tables.flatMap(table => [...structuredClone(before.columns.filter(c => c.t === table.name)), ...added.filter(c => c.t === table.name)])
    after.foreignKeys = [
        { t: 'colab', c: 'gerencia_id', parentSchema: TARGET, parent: 'gerencias', parentColumn: 'id', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' },
        { t: 'gerencias', c: 'demandante_id', parentSchema: TARGET, parent: 'users2', parentColumn: 'id', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' },
        { t: 'registros', c: 'colab_id', parentSchema: TARGET, parent: 'colab', parentColumn: 'id', onUpdate: 'RESTRICT', onDelete: 'RESTRICT' }
    ]
    for (const [t, name, columns] of [['colab', 'colab_gerencia_active_index', ['gerencia_id', 'deletedAt']], ['registros', 'registros_colab_id_index', ['colab_id']],
        ['sessions', 'sessions_expired_index', ['expired']], ['auth_rate_limits', 'auth_rate_limits_expire_index', ['expire']]]) {
        after.indexes.push(...columns.map((columnName, i) => ({ t, name, columnName, position: i + 1, nonUnique: 1, prefixLength: null, type: 'BTREE' })))
    }
    return after
}

test('schema verifier distinguishes engine checkpoint from final structures and preserves original types/indexes', () => {
    verifyCatalogAfter(before, afterCatalog('engines'), 'engines')
    verifyCatalogAfter(before, afterCatalog('structures'), 'structures')
    for (const issue of ['historicalType', 'legacyEngine', 'nullableOwner', 'cascade', 'crossSchema', 'extraTable', 'activeDefault']) {
        const after = afterCatalog('structures')
        if (issue === 'historicalType') after.columns.find(c => c.t === 'users2' && c.name === 'password').type = 'varchar(60)'
        if (issue === 'legacyEngine') after.tables.find(t => t.name === 'petro').engine = 'InnoDB'
        if (issue === 'nullableOwner') after.columns.find(c => c.t === 'gerencias' && c.name === 'demandante_id').nullable = 'YES'
        if (issue === 'cascade') after.foreignKeys[0].onDelete = 'CASCADE'
        if (issue === 'crossSchema') after.foreignKeys[1].parentSchema = SOURCE
        if (issue === 'extraTable') after.tables.push({ name: 'unexpected' })
        if (issue === 'activeDefault') after.columns.find(c => c.name === 'active').def = '1'
        assert.throws(() => verifyCatalogAfter(before, after, 'structures'), issue)
    }
})

test('historical comparison selects only pre-existing columns and detects changed hash/content while releasing locks', async () => {
    for (const modified of [false, true]) {
        const queries = [], db = { async query(input, bindings = []) {
            const sql = typeof input === 'string' ? input : input.sql; queries.push({ sql, bindings })
            if (sql.startsWith('SELECT ')) {
                const table = bindings.at(-1), rows = structuredClone(content[table])
                assert.deepEqual(bindings.slice(0, -2), before.columns.filter(c => c.t === table).map(c => c.name))
                if (modified && table === 'users2') rows[0].password = 'changed_synthetic_hash'
                return [rows]
            }
            if (sql.startsWith('SHOW CREATE')) return [[{ 'Create Table': baseline[bindings[1]].ddl.replace('ENGINE=MyISAM',
                ['colab', 'registros', 'users2'].includes(bindings[1]) ? 'ENGINE=InnoDB' : 'ENGINE=MyISAM') }]]
            return [[]]
        } }
        if (modified) await assert.rejects(verifyHistorical(db, baseline, before, 'engines'), { code: 'E1_HISTORICAL_CONTENT_CHANGED' })
        else await verifyHistorical(db, baseline, before, 'engines')
        assert.equal(queries.at(-1).sql, 'UNLOCK TABLES')
        assert.equal(queries.some(q => /^(UPDATE|INSERT|DELETE|ALTER)/.test(q.sql)), false)
    }
})

test('copy control rejects unowned connections, metadata locks and a lost advisory lock without killing clients', async () => {
    for (const issue of ['connection', 'metadata', 'advisory']) {
        const queries = [], db = { async query(sql) {
            queries.push(sql)
            if (sql.includes('metadata_locks')) return [issue === 'metadata' ? [{ id: 99 }] : []]
            if (sql.includes('threads')) return [[{ id: 41, db: TARGET }, ...(issue === 'connection' ? [{ id: 99, db: TARGET }] : [])]]
            return [[{ id: issue === 'advisory' ? 99 : 41 }]]
        } }
        await assert.rejects(assertExclusive(db, [41])); assert.ok(queries.every(sql => sql.startsWith('SELECT')))
    }
})

test('transaction probes always rollback, require FK rejection, and never hash/activate/create accounts or persistent mappings', async () => {
    for (const rejectForeignKeys of [true, false]) {
        const statements = []; let begun = false, rolledBack = false
        const db = { async beginTransaction() { begun = true }, async rollback() { rolledBack = true }, async query(sql, bindings) {
            statements.push({ sql, bindings })
            if (sql.startsWith('SELECT MIN')) return [[{ id: 1 }]]
            if (sql.startsWith('SELECT session_version')) return [[{ session_version: 1 }]]
            if (sql.includes('4294967295') && rejectForeignKeys) throw Object.assign(new Error('synthetic private SQL error'), { code: 'ER_NO_REFERENCED_ROW_2' })
            if (sql.startsWith('SELECT COUNT')) { assert.equal(rolledBack, true); return [[{ total: 0 }]] }
            assert.equal(begun, true); assert.equal(bindings[0], TARGET); return [{}]
        } }
        if (rejectForeignKeys) assert.deepEqual(await transactionProbes(db), { transactionRolledBack: true, invalidChildUpdatesRejected: 2 })
        else await assert.rejects(transactionProbes(db), { code: 'E1_FOREIGN_KEY_PROBE_FAILED' })
        assert.equal(rolledBack, true)
        assert.equal(statements.some(q => /\b(password|INSERT|DELETE|DROP|TRUNCATE)\b|SET active/i.test(q.sql)), false)
    }
})
