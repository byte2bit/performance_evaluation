const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { SOURCE, TARGET, CONFIRMATION, staticConnection, grantPrivileges, assertScope,
    quoteOption, lockRead, assertDump, dumpOptions, copy, inspect } = require('../scripts/local-mysql-copy')

const profile = { kind: 'evaluation-local-mysql-copy-v1', id: 'a'.repeat(32), host: '127.0.0.1', port: 3306,
    source: SOURCE, target: TARGET, serverUuid: '00000000-0000-0000-0000-000000000001' }
const config = { host: '127.0.0.1', port: 3306, database: SOURCE, user: 'synthetic_sql_user', password: 'synthetic-client-secret' }
const metadata = { serverUuid: profile.serverUuid, mysqlVersion: '8.0.44', charset: 'utf8mb3', collation: 'utf8mb3_general_ci',
    tables: ['colab', 'migrations', 'migrations_lock', 'registros', 'spare_a', 'spare_b', 'spare_c', 'spare_d', 'users2'] }
const ddl = metadata.tables.map(name => `CREATE TABLE \`${name}\` (id int) ENGINE=MyISAM;`).join('\n')

function harness({ failDump = false, mismatch = false, targetExists = false, changedUuid = false } = {}) {
    const files = new Map(), queries = [], calls = [], locks = { source: false, target: false }
    const directory = path.resolve('synthetic-private-copy-fixture')
    let created = false, destroyed = 0
    const source = {
        async query(query, bindings) {
            const sql = typeof query === 'string' ? query : query.sql
            queries.push({ connection: 'source', sql, bindings })
            assert.match(sql, /^(SET SESSION|LOCK TABLES|UNLOCK TABLES)/)
            if (sql.startsWith('LOCK TABLES')) locks.source = true
            if (sql === 'UNLOCK TABLES') locks.source = false
            return [[]]
        }, destroy() { destroyed++ }
    }
    const target = {
        async query(query, bindings) {
            const sql = typeof query === 'string' ? query : query.sql
            queries.push({ connection: 'target', sql, bindings })
            if (sql.includes('information_schema.SCHEMATA')) return [[{ count: targetExists ? 1 : 0 }]]
            if (sql.startsWith('CREATE DATABASE')) { assert.deepEqual(bindings, [TARGET]); created = true; return [[]] }
            if (sql.startsWith('LOCK TABLES')) { locks.target = true; return [[]] }
            if (sql === 'UNLOCK TABLES') { locks.target = false; return [[]] }
            if (sql.includes('information_schema.TABLES')) return [metadata.tables.map(name => ({ name }))]
            assert.equal(sql, 'SET SESSION lock_wait_timeout=5'); return [[]]
        }, destroy() { destroyed++ }
    }
    const storage = {
        existsSync: file => files.has(file),
        writeFileSync(file, content, options) { assert.equal(options.flag, 'wx'); assert.equal(files.has(file), false); files.set(file, content) },
        readFileSync(file) { assert.equal(files.has(file), true); return files.get(file) },
        unlinkSync(file) { files.delete(file) }
    }
    const backupKey = randomBytes(32), inventorySecret = randomBytes(32).toString('hex')
    const args = { profile, config, confirmation: CONFIRMATION, directory, backupKey, inventorySecret, storage,
        async connector(connection, database) { calls.push(database); return database === SOURCE ? source : target },
        async inspector() { return { ...metadata, serverUuid: changedUuid ? 'f'.repeat(36) : profile.serverUuid } },
        async snapshotter(connection, schema, tables) {
            assert.equal(locks.source, true)
            if (schema === TARGET) assert.equal(locks.target, true)
            return Object.fromEntries(tables.map(name => [name, { ddl: 'preserved ddl',
                count: ({ colab: 100, registros: 498, users2: 25 })[name] || 0,
                digest: mismatch && schema === TARGET ? 'changed' : 'original' }]))
        },
        client(binaryDirectory, executable, optionsFile, args, input) {
            assert.equal(locks.source, true, 'Source must remain read locked during both dump and restore')
            assert.equal(args.includes(config.password), false)
            if (executable === 'mysqldump') {
                assert.deepEqual(args.slice(-10), [SOURCE, ...metadata.tables])
                assert.ok(args.includes('--skip-add-drop-table'))
                if (failDump) throw Object.assign(new Error('synthetic private diagnostic'), { code: 'SYNTHETIC_DUMP_FAILED' })
                return Buffer.from(ddl)
            }
            assert.equal(executable, 'mysql'); assert.equal(created, true)
            assert.equal(args.at(-1), TARGET); assert.equal(input.toString(), ddl)
        }
    }
    return { args, files, queries, calls, locks, directory, get created() { return created }, get destroyed() { return destroyed } }
}

test('legacy connection is parsed statically and cannot execute configuration code or select a different target', () => {
    const serialize = db => 'module.exports = ' + JSON.stringify({ db })
    assert.deepEqual(staticConnection(serialize(config)), config)
    assert.deepEqual(staticConnection('const database = ' + JSON.stringify(config) + '; module.exports = { db: database }'), config)
    for (const source of [serialize(config) + '; process.exit(0)', 'module.exports = require("./private")',
        'module.exports = { db: (() => {})() }', serialize({ ...config, host: 'remote.example.invalid' }),
        serialize({ ...config, database: TARGET }), serialize({ ...config, port: 50470 })]) assert.throws(() => staticConnection(source))
})

test('grant matching respects escaped schema names and source-only privileges do not authorize the copy', () => {
    const grants = [{ row: 'GRANT ALL PRIVILEGES ON `inova\\_nucleo`.* TO synthetic' },
        { row: 'GRANT CREATE, SELECT, INSERT, LOCK TABLES ON *.* TO synthetic' }]
    assert.equal(grantPrivileges(grants, SOURCE)('TRIGGER'), true)
    assert.equal(grantPrivileges(grants, TARGET)('CREATE'), true)
    assert.equal(grantPrivileges(grants, TARGET)('DROP'), false)
    assert.equal(grantPrivileges(grants.slice(0, 1), TARGET)('CREATE'), false)
})

test('copy scope refuses another source, destination, port, identity or missing confirmation before connection', async () => {
    for (const change of [{ source: TARGET }, { target: SOURCE }, { target: 'another_copy' }, { port: 50470 }, { host: 'remote.example.invalid' }, { id: '../escape' }]) {
        assert.throws(() => assertScope({ ...profile, ...change }, CONFIRMATION))
        await assert.rejects(copy({ profile: { ...profile, ...change }, confirmation: CONFIRMATION,
            connector() { assert.fail('No connection for an unapproved scope') } }))
    }
    assert.throws(() => assertScope(profile, null))
})

test('client option values are quoted without password in argv or injected option lines', () => {
    assert.equal(quoteOption('synthetic"\\\nport=9999\r\t'), '"synthetic\\"\\\\\\nport=9999\\r\\t"')
    assert.throws(() => quoteOption('bad\0value'))
})

test('MyISAM source locks use READ on every explicit source table, without READ LOCAL or a global lock', async () => {
    const queries = []
    await lockRead({ async query(sql, bindings) { queries.push({ sql, bindings }); return [[]] } }, SOURCE, ['colab', 'registros'])
    assert.equal(queries[0].sql, 'SET SESSION lock_wait_timeout=5')
    assert.equal(queries[1].sql.sql, 'LOCK TABLES ??.?? READ, ??.?? READ')
    assert.deepEqual(queries[1].bindings, [SOURCE, 'colab', SOURCE, 'registros'])
    assert.equal(dumpOptions.includes('--single-transaction'), false)
    for (const option of ['--skip-lock-tables', '--skip-add-locks', '--skip-add-drop-table', '--skip-disable-keys', '--set-gtid-purged=OFF']) assert.ok(dumpOptions.includes(option))
})

test('dump validation rejects database changes, destructive commands, source qualifications and unexpected tables', () => {
    assertDump(Buffer.from(ddl), metadata.tables)
    for (const command of ['USE original;', 'CREATE DATABASE another;', 'DROP TABLE `users2`;', 'ALTER TABLE `colab` ENGINE=InnoDB;',
        'GRANT ALL ON *.* TO synthetic;', 'SET @@GLOBAL.x=1;', '/*!80000 SET @@GLOBAL.x=1 */;', 'LOCK TABLES x WRITE;']) {
        assert.throws(() => assertDump(Buffer.from(command + '\n' + ddl), metadata.tables))
    }
    assert.throws(() => assertDump(Buffer.from(ddl + '\nINSERT INTO `' + SOURCE + '`.`colab` VALUES(1);'), metadata.tables))
    assert.throws(() => assertDump(Buffer.from(ddl + '\nCREATE TABLE `unexpected` (id int);'), metadata.tables))
})

test('copy creates only the approved target, verifies encrypted backup/readback and both snapshots, and preserves hashes', async () => {
    const h = harness(), report = await copy(h.args)
    assert.equal(report.success, true); assert.equal(report.sourceUnchanged, true); assert.equal(report.accountHashesPreserved, true)
    assert.deepEqual(report.coreCounts, { users2: 25, colab: 100, registros: 498 })
    assert.equal(report.sourceReadLocksUsed, true); assert.equal(report.globalLockUsed, false)
    assert.equal(report.migrationsExecuted, 0); assert.equal(report.applicationSwitched, false)
    assert.equal(h.created, true); assert.equal(h.destroyed, 2)
    assert.deepEqual(h.locks, { source: false, target: false })
    assert.equal(h.files.has(path.join(h.directory, 'client-copy.cnf')), false)
    assert.equal(h.files.size, 3)
    for (const content of h.files.values()) {
        assert.equal(content.includes(config.password), false)
        assert.equal(content.includes(ddl), false)
    }
    h.args.backupKey.fill(0)
})

test('dump failure releases source locks, removes only our temporary credential file and never creates a database', async () => {
    const h = harness({ failDump: true })
    await assert.rejects(copy(h.args), { code: 'SYNTHETIC_DUMP_FAILED' })
    assert.equal(h.created, false); assert.equal(h.destroyed, 2)
    assert.deepEqual(h.locks, { source: false, target: false })
    assert.equal(h.files.size, 0); h.args.backupKey.fill(0)
})

test('source identity changes and a destination appearing during backup block all target DDL', async () => {
    for (const options of [{ changedUuid: true }, { targetExists: true }]) {
        const h = harness(options)
        await assert.rejects(copy(h.args), { code: options.changedUuid ? 'SERVER_IDENTITY_CHANGED' : 'DESTINATION_EXISTS' })
        assert.equal(h.created, false)
        assert.deepEqual(h.locks, { source: false, target: false })
        assert.equal(h.files.has(path.join(h.directory, 'client-copy.cnf')), false)
        h.args.backupKey.fill(0)
    }
})

test('copy comparison failures preserve the created copy and encrypted backup without cleanup DDL or source writes', async () => {
    const h = harness({ mismatch: true })
    await assert.rejects(copy(h.args))
    assert.equal(h.created, true)
    assert.equal(h.files.has(path.join(h.directory, 'backup.evalbackup')), true)
    assert.equal(h.files.has(path.join(h.directory, 'client-copy.cnf')), false)
    assert.deepEqual(h.locks, { source: false, target: false })
    assert.equal(h.queries.some(query => /^(DROP|DELETE|UPDATE|INSERT|ALTER)/.test(query.sql)), false)
    h.args.backupKey.fill(0)
})

test('preexisting artifacts are refused without connections, deletion or overwriting', async () => {
    const h = harness(), file = path.join(h.directory, 'client-copy.cnf')
    h.files.set(file, 'preexisting protected artifact')
    await assert.rejects(copy(h.args), { code: 'COPY_ARTIFACT_EXISTS' })
    assert.equal(h.calls.length, 0)
    assert.equal(h.files.get(file), 'preexisting protected artifact')
    h.args.backupKey.fill(0)
})

test('live preflight is read-only and refuses a non-MyISAM object or missing privileges before locking', async () => {
    for (const issue of ['engine', 'privileges']) {
        const queries = []
        const connection = { async query(sql) {
            queries.push(sql); assert.match(sql, /^(SELECT|SHOW)/)
            if (sql.includes('@@port')) return [[{ port: 3306, uuid: profile.serverUuid, version: '8.0.44' }]]
            if (sql === 'SHOW GRANTS') return issue === 'privileges' ? [[{ grants: 'GRANT SELECT ON *.* TO synthetic' }]] : [[{ grants: 'GRANT ALL PRIVILEGES ON *.* TO synthetic' }]]
            if (sql.includes('information_schema.SCHEMATA')) return [[{ count: 0 }]]
            if (sql.includes('information_schema.TABLES')) return [metadata.tables.map(name => ({ name, type: 'BASE TABLE', engine: name === 'colab' ? 'InnoDB' : 'MyISAM' }))]
            assert.fail('Preflight must stop before additional inspection')
        } }
        await assert.rejects(inspect(connection), { code: issue === 'engine' ? 'SOURCE_OBJECTS_CHANGED' : 'REQUIRED_PRIVILEGES_MISSING' })
    }
})
