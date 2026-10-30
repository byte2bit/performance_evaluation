// Explicit backup/copy of the approved fictitious legacy database only.
// Does not execute .env, load the app, apply migrations, change accounts or send mail.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const mysql = require('mysql2/promise')
const { parse } = require('../../frontend/node_modules/@babel/parser')
const { seal, unseal, mysqlClient } = require('./isolated-recovery')
const { encryptDetails } = require('./isolated-inventory')

const SOURCE = 'inova_nucleo'
const TARGET = 'inova_nucleo_compat_20261029'
const CONFIRMATION = SOURCE + ':3306->' + TARGET + ':copy-only'
const coreCounts = { users2: 25, colab: 100, registros: 498 }
const binaries = 'C:/Program Files/MySQL/MySQL Server 8.0/bin'
const requireCondition = (value, code) => { if (!value) throw Object.assign(new Error('Local copy precondition failed'), { code }) }

function staticConnection(code) {
    requireCondition(Buffer.byteLength(code, 'utf8') <= 65536, 'CONFIG_TOO_LARGE')
    const ast = parse(code, { sourceType: 'script' }), variables = new Map()
    let exported
    for (const statement of ast.program.body) {
        if (statement.type === 'VariableDeclaration') {
            for (const item of statement.declarations) {
                requireCondition(item.id.type === 'Identifier', 'CONFIG_UNSUPPORTED')
                variables.set(item.id.name, item.init)
            }
        } else {
            const e = statement.type === 'ExpressionStatement' && statement.expression
            requireCondition(e?.type === 'AssignmentExpression' && e.operator === '=' && e.left.type === 'MemberExpression' &&
                !e.left.computed && e.left.object.name === 'module' && e.left.property.name === 'exports' && !exported, 'CONFIG_UNSUPPORTED')
            exported = e.right
        }
    }
    function literal(node, depth = 0) {
        requireCondition(node && depth <= 8, 'CONFIG_UNSUPPORTED')
        if (node.type === 'Identifier' && variables.has(node.name)) return literal(variables.get(node.name), depth + 1)
        if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral'].includes(node.type)) return node.value ?? null
        requireCondition(node.type === 'ObjectExpression', 'CONFIG_UNSUPPORTED')
        const result = Object.create(null)
        for (const p of node.properties) {
            requireCondition(p.type === 'ObjectProperty' && !p.computed, 'CONFIG_UNSUPPORTED')
            const name = p.key.name ?? p.key.value
            requireCondition(typeof name === 'string' && !Object.hasOwn(result, name), 'CONFIG_UNSUPPORTED')
            result[name] = literal(p.value, depth + 1)
        }
        return result
    }
    const db = literal(exported).db
    requireCondition(db && db.host === '127.0.0.1' && Number(db.port || 3306) === 3306 && db.database === SOURCE, 'SOURCE_NOT_APPROVED')
    requireCondition(typeof db.user === 'string' && db.user.length > 0 && typeof db.password === 'string' && db.password.length > 0, 'CONNECTION_INCOMPLETE')
    return { host: db.host, port: 3306, database: SOURCE, user: db.user, password: db.password }
}

function grantPrivileges(rows, schema) {
    const privileges = new Set()
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    function matches(pattern) {
        let regex = '^'
        for (let i = 0; i < pattern.length; i++) {
            const char = pattern[i]
            if (char === '\\' && i + 1 < pattern.length) regex += escape(pattern[++i])
            else regex += char === '%' ? '.*' : char === '_' ? '.' : escape(char)
        }
        return new RegExp(regex + '$').test(schema)
    }
    for (const row of rows) {
        const match = String(Object.values(row)[0]).match(/^GRANT ([A-Z_, ]+) ON (`(?:``|[^`])+`|\*)\.\* TO /)
        if (match && matches(match[2] === '*' ? '%' : match[2].slice(1, -1).replace(/``/g, '`'))) {
            for (const privilege of match[1].split(/,\s*/)) privileges.add(privilege)
        }
    }
    return privilege => privileges.has('ALL PRIVILEGES') || privileges.has(privilege)
}

async function inspect(connection) {
    const [[server]] = await connection.query('SELECT @@port AS port, @@server_uuid AS uuid, VERSION() AS version')
    requireCondition(Number(server.port) === 3306 && /^[a-f0-9-]{36}$/.test(server.uuid) && server.version === '8.0.44', 'SERVER_NOT_APPROVED')
    const [grants] = await connection.query('SHOW GRANTS')
    for (const [schema, privileges] of [[SOURCE, ['SELECT', 'LOCK TABLES', 'TRIGGER', 'EVENT', 'EXECUTE']], [TARGET, ['CREATE', 'SELECT', 'INSERT', 'LOCK TABLES']]]) {
        const allowed = grantPrivileges(grants, schema)
        requireCondition(privileges.every(privilege => allowed(privilege)), 'REQUIRED_PRIVILEGES_MISSING')
    }
    const [[existing]] = await connection.query('SELECT COUNT(*) AS count FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [TARGET])
    requireCondition(Number(existing.count) === 0, 'DESTINATION_EXISTS')
    const [tables] = await connection.query('SELECT TABLE_NAME AS name, TABLE_TYPE AS type, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', [SOURCE])
    requireCondition(tables.length === 9 && tables.every(table => /^[a-zA-Z0-9_]+$/.test(table.name) && table.type === 'BASE TABLE' && table.engine === 'MyISAM'), 'SOURCE_OBJECTS_CHANGED')
    for (const [catalog, column] of [['TRIGGERS', 'TRIGGER_SCHEMA'], ['ROUTINES', 'ROUTINE_SCHEMA'], ['EVENTS', 'EVENT_SCHEMA']]) {
        const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM information_schema.?? WHERE ??=?', [catalog, column, SOURCE])
        requireCondition(Number(row.count) === 0, 'UNSUPPORTED_SOURCE_OBJECTS')
    }
    const [[references]] = await connection.query('SELECT COUNT(*) AS count FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_SCHEMA IS NOT NULL AND REFERENCED_TABLE_SCHEMA<>TABLE_SCHEMA', [SOURCE])
    requireCondition(Number(references.count) === 0, 'EXTERNAL_SOURCE_REFERENCE')
    const [[schema]] = await connection.query('SELECT DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [SOURCE])
    requireCondition(/^[a-z0-9_]+$/.test(schema.charset) && /^[a-z0-9_]+$/.test(schema.collation), 'UNSUPPORTED_SCHEMA_CHARSET')
    let estimatedRows = 0
    for (const table of tables) {
        const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM ??.??', [SOURCE, table.name])
        const count = Number(row.count)
        requireCondition(Number.isSafeInteger(count) && count <= 10000, 'SOURCE_VOLUME_UNSUPPORTED')
        if (Object.hasOwn(coreCounts, table.name)) requireCondition(count === coreCounts[table.name], 'SOURCE_COUNTS_CHANGED')
        estimatedRows += count
    }
    requireCondition(estimatedRows <= 50000, 'SOURCE_VOLUME_UNSUPPORTED')
    return { serverUuid: server.uuid, mysqlVersion: server.version, tables: tables.map(table => table.name), estimatedRows, ...schema }
}

function assertScope(profile, confirmation) {
    requireCondition(confirmation === CONFIRMATION && profile.kind === 'evaluation-local-mysql-copy-v1' &&
        profile.source === SOURCE && profile.target === TARGET && profile.host === '127.0.0.1' && profile.port === 3306 &&
        /^[a-f0-9]{32}$/.test(profile.id) && /^[a-f0-9-]{36}$/.test(profile.serverUuid), 'COPY_SCOPE_NOT_APPROVED')
}

function quoteOption(value) {
    requireCondition(typeof value === 'string' && !value.includes('\0') && value.length <= 4096, 'UNSUPPORTED_CLIENT_VALUE')
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"'
}

async function lockRead(connection, schema, tables) {
    await connection.query('SET SESSION lock_wait_timeout=5')
    await connection.query({ sql: 'LOCK TABLES ' + tables.map(() => '??.?? READ').join(', '), timeout: 10000 }, tables.flatMap(table => [schema, table]))
}

async function snapshot(connection, schema, tables) {
    const result = {}
    for (const table of tables) {
        const [[count]] = await connection.query('SELECT COUNT(*) AS count FROM ??.??', [schema, table])
        requireCondition(Number(count.count) <= 10000, 'SOURCE_VOLUME_UNSUPPORTED')
        const [[definition]] = await connection.query('SHOW CREATE TABLE ??.??', [schema, table])
        const [rows] = await connection.query('SELECT * FROM ??.??', [schema, table])
        requireCondition(rows.length === Number(count.count), 'SNAPSHOT_CHANGED')
        result[table] = { ddl: definition['Create Table'], count: rows.length,
            digest: createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex') }
    }
    return result
}

function assertDump(dump, tables) {
    const text = dump.toString('utf8')
    requireCondition(dump.length > 0 && dump.length <= 32 * 1024 * 1024, 'DUMP_SIZE_UNSUPPORTED')
    requireCondition(!/^\s*(?:USE|CREATE DATABASE|DROP DATABASE|ALTER DATABASE|GRANT|REVOKE|CREATE USER|DROP USER|ALTER USER|DROP TABLE|LOCK TABLES|UNLOCK TABLES|ALTER TABLE)\b/im.test(text), 'DUMP_COMMAND_NOT_APPROVED')
    requireCondition(!/^\s*(?:\/\*!\d+\s*)?SET\s+(?:@@)?GLOBAL\b/im.test(text), 'DUMP_COMMAND_NOT_APPROVED')
    requireCondition(!text.includes('`' + SOURCE + '`.'), 'DUMP_SOURCE_QUALIFICATION')
    const created = [...text.matchAll(/^CREATE TABLE `([a-zA-Z0-9_]+)`/gm)].map(match => match[1]).sort()
    assert.deepEqual(created, [...tables].sort())
}

const dumpOptions = ['--quick', '--skip-lock-tables', '--skip-add-locks', '--skip-add-drop-table', '--skip-disable-keys',
    '--set-gtid-purged=OFF', '--no-tablespaces', '--hex-blob', '--skip-comments', '--default-character-set=utf8mb4']
function connect(config, database) {
    return mysql.createConnection({ ...config, database, connectTimeout: 3000, multipleStatements: false, debug: false, trace: false,
        charset: 'utf8mb4', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true })
}

async function copy({ profile, confirmation, config, directory, backupKey, inventorySecret, progress = () => {},
    connector = connect, inspector = inspect, snapshotter = snapshot, client = mysqlClient, storage = fs }) {
    assertScope(profile, confirmation)
    requireCondition(config.host === '127.0.0.1' && config.port === 3306 && config.database === SOURCE, 'SOURCE_NOT_APPROVED')
    requireCondition(Buffer.isBuffer(backupKey) && backupKey.length === 32 && /^[a-f0-9]{64}$/.test(inventorySecret), 'BACKUP_SECRETS_REQUIRED')
    const optionsFile = path.join(directory, 'client-copy.cnf'), backupFile = path.join(directory, 'backup.evalbackup')
    for (const name of ['client-copy.cnf', 'backup.evalbackup', 'manifest.evalinventory', 'copy-report.json']) {
        requireCondition(!storage.existsSync(path.join(directory, name)), 'COPY_ARTIFACT_EXISTS')
    }
    let source, target, sourceLocked = false, targetLocked = false, dump, decrypted
    try {
        source = await connector(config, SOURCE)
        const metadata = await inspector(source)
        requireCondition(metadata.serverUuid === profile.serverUuid, 'SERVER_IDENTITY_CHANGED')
        target = await connector(config, undefined)
        progress('source-read-lock')
        await lockRead(source, SOURCE, metadata.tables); sourceLocked = true
        const before = await snapshotter(source, SOURCE, metadata.tables)
        for (const [table, expected] of Object.entries(coreCounts)) requireCondition(before[table]?.count === expected, 'SOURCE_COUNTS_CHANGED')
        storage.writeFileSync(optionsFile, '[client]\nhost=127.0.0.1\nport=3306\nprotocol=TCP\nuser=' + quoteOption(config.user) + '\npassword=' + quoteOption(config.password) + '\n', { flag: 'wx', mode: 0o600 })
        progress('encrypted-backup')
        dump = client(binaries, 'mysqldump', optionsFile, [...dumpOptions, SOURCE, ...metadata.tables])
        assertDump(dump, metadata.tables)
        storage.writeFileSync(backupFile, JSON.stringify(seal(dump, backupKey, profile.id + ':' + SOURCE)), { flag: 'wx', mode: 0o600 })
        decrypted = unseal(JSON.parse(storage.readFileSync(backupFile, 'utf8')), backupKey, profile.id + ':' + SOURCE)
        requireCondition(createHash('sha256').update(dump).digest('hex') === createHash('sha256').update(decrypted).digest('hex'), 'BACKUP_READBACK_MISMATCH')
        assert.deepEqual(await snapshotter(source, SOURCE, metadata.tables), before)
        // The controller is not the source-lock session; DDL is target-only.
        const [[existing]] = await target.query('SELECT COUNT(*) AS count FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [TARGET])
        requireCondition(Number(existing.count) === 0, 'DESTINATION_EXISTS')
        progress('create-approved-copy')
        await target.query('CREATE DATABASE ?? CHARACTER SET ' + metadata.charset + ' COLLATE ' + metadata.collation, [TARGET])
        client(binaries, 'mysql', optionsFile, ['--binary-mode', '--default-character-set=utf8mb4', TARGET], decrypted)
        await lockRead(target, TARGET, metadata.tables); targetLocked = true
        progress('compare-copy-and-source')
        assert.deepEqual(await snapshotter(target, TARGET, metadata.tables), before)
        assert.deepEqual(await snapshotter(source, SOURCE, metadata.tables), before)
        await target.query('UNLOCK TABLES'); targetLocked = false
        const [catalog] = await target.query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', [SOURCE])
        assert.deepEqual(catalog.map(table => table.name), metadata.tables)
        const manifest = { profileId: profile.id, source: SOURCE, target: TARGET, serverUuid: profile.serverUuid, before }
        storage.writeFileSync(path.join(directory, 'manifest.evalinventory'), JSON.stringify(encryptDetails(manifest, inventorySecret, profile.id + ':' + SOURCE + ':' + TARGET, profile.id)), { flag: 'wx', mode: 0o600 })
        const report = { success: true, source: { host: '127.0.0.1', port: 3306, database: SOURCE }, target: TARGET,
            mysqlVersion: metadata.mysqlVersion, tablesCompared: metadata.tables.length,
            rowsCompared: Object.values(before).reduce((sum, table) => sum + table.count, 0), coreCounts,
            sourceEngine: 'MyISAM', schemaDefault: { charset: metadata.charset, collation: metadata.collation },
            sourceReadLocksUsed: true, globalLockUsed: false, ddlAndContentMatch: true, sourceUnchanged: true,
            encryptedBackup: 'backup.evalbackup', encryptedManifest: 'manifest.evalinventory',
            accountHashesPreserved: true, migrationsExecuted: 0, accountsOrLinksChanged: false, applicationSwitched: false,
            copyPreserved: true, completedUtc: new Date().toISOString() }
        storage.writeFileSync(path.join(directory, 'copy-report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
        return report
    } finally {
        try { if (targetLocked) await target.query('UNLOCK TABLES') }
        finally {
            try { if (sourceLocked) await source.query('UNLOCK TABLES') }
            finally {
                // Destroy only our two sessions; never kill another client.
                target?.destroy(); source?.destroy()
                dump?.fill(0); decrypted?.fill(0)
                if (storage.existsSync(optionsFile)) storage.unlinkSync(optionsFile)
            }
        }
    }
}

let stage = 'configuration'
async function main() {
    const config = staticConnection(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8'))
    const action = process.argv[2]
    requireCondition(['preflight', 'copy'].includes(action), 'ACTION_UNSUPPORTED')
    if (action === 'preflight') {
        const connection = await connect(config, SOURCE)
        try { console.log(JSON.stringify({ success: true, ...await inspect(connection) })) }
        finally { connection.destroy() }
        return
    }
    const directory = fs.realpathSync(process.argv[3])
    const expectedDirectory = path.resolve(process.env.LOCALAPPDATA || '', 'EvaluationDev/inova-nucleo-compat-20261029')
    requireCondition(directory.toLowerCase() === expectedDirectory.toLowerCase(), 'PROFILE_DIRECTORY_NOT_APPROVED')
    const profile = JSON.parse(fs.readFileSync(path.join(directory, 'profile.json'), 'utf8').replace(/^\uFEFF/, ''))
    requireCondition(/^[a-f0-9]{64}$/.test(process.env.EVAL_LOCAL_COPY_BACKUP_KEY || ''), 'BACKUP_SECRETS_REQUIRED')
    const key = Buffer.from(process.env.EVAL_LOCAL_COPY_BACKUP_KEY, 'hex')
    try {
        const report = await copy({ profile, config, directory, backupKey: key,
            inventorySecret: process.env.EVAL_LOCAL_COPY_INVENTORY_SECRET, confirmation: process.env.EVAL_LOCAL_COPY_CONFIRMATION,
            progress(value) { stage = value; console.log(JSON.stringify({ stage })) } })
        console.log(JSON.stringify(report))
    } finally { key.fill(0) }
}
if (require.main === module) main().catch(error => {
    const line = error.stack?.match(/local-mysql-copy\.js:(\d+):\d+/)?.[1]
    console.error(JSON.stringify({ success: false, stage, code: /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'LOCAL_COPY_FAILED',
        ...(line ? { location: Number(line) } : {}), privateDiagnosticsSuppressed: true }))
    process.exitCode = 1
})
module.exports = { SOURCE, TARGET, CONFIRMATION, staticConnection, grantPrivileges, inspect, assertScope, quoteOption, lockRead, assertDump, dumpOptions, copy, snapshot }
