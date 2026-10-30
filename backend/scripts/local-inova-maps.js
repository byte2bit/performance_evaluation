const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const mysql = require('mysql2/promise')
const knexFactory = require('knex')
const { createHash } = require('node:crypto')
const { SOURCE, TARGET, CONFIRMATION, assertScope, staticConnection, grantPrivileges, lockRead, snapshot, quoteOption, dumpOptions, assertDump } = require('./local-mysql-copy')
const { catalog, migrationNames: e1Names, LEDGER } = require('./local-mysql-compat')
const { checkServer, lockedSnapshot } = require('./local-mysql-access')
const { encryptDetails, decryptDetails } = require('./isolated-inventory')
const { mysqlClient, seal, unseal } = require('./isolated-recovery')
const { ensure } = require('./local-access-guard')
const { authorize, E3_CONFIRMATION } = require('../compat/inova/maps-scope')
const { publicUser, isAdmin, scope: professionalScope } = require('../lib/auth/identity')
const { createRecords } = require('../lib/records')

const third = '20261029000300_require_colab_gerencia.js'
const migrationNames = Object.freeze([...e1Names, third])
const files = ['maps-e3-before.evalbackup', 'maps-e3-before.evalinventory', 'maps-e3-proposal.evalinventory', 'maps-e3-applied.evalinventory', 'maps-e3-report.json', 'maps-e3-failure.json', 'client-maps-e3.cnf']
const lockName = 'evaluation:inova-compat:20261029:e3'
const digest = rows => createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex')
const normalAuto = ddl => ddl.replace(/ AUTO_INCREMENT=\d+/, '')
const auto = ddl => Number(ddl.match(/ AUTO_INCREMENT=(\d+)/)?.[1] || 1)
const privateIdentity = profile => profile.id + ':' + SOURCE + ':' + TARGET

function assertStage(profile, config, confirmation) {
    assertScope(profile, CONFIRMATION)
    ensure(confirmation === E3_CONFIRMATION && config.host === '127.0.0.1' && config.port === 3306 && config.database === SOURCE, 'E3_SCOPE_REFUSED')
}

function loadPrivate(directory, profile, secret, name, identity, storage = fs) {
    return decryptDetails(JSON.parse(storage.readFileSync(path.join(directory, name), 'utf8')), secret, identity, profile.id)
}

function proposalFrom(professionals, records, pairs, allPairs, accounts) {
    ensure(professionals.length === 100 && records.length === 498 && accounts.length === 25, 'E3_VOLUME_CHANGED')
    ensure(accounts.some(row => row.id === 12 && row.active === 1 && row.deletedAt === null), 'E3_OWNER_UNAVAILABLE')
    ensure(accounts.every(row => row.active === 1 && row.session_version === 1 && row.deletedAt === null) && accounts.filter(row => row.admin === 1).length === 2, 'E3_ACCOUNTS_CHANGED')
    const groups = []
    for (const person of [...professionals].sort((a, b) => a.id - b.id)) {
        ensure(person.gerencia_id === null && typeof person.gerencia === 'string' && person.gerencia.trim() === person.gerencia &&
            person.gerencia.length > 0 && [...person.gerencia].length <= 255 && person.deletedAt === null, 'E3_PROFESSIONAL_STATE_CHANGED')
        let group = groups.find(row => row.name === person.gerencia)
        if (!group) { group = { id: groups.length + 1, alias: 'G0' + (groups.length + 1), name: person.gerencia, ownerId: 12, professionalIds: [] }; groups.push(group) }
        group.professionalIds.push(person.id)
    }
    assert.deepEqual(groups.map(row => row.professionalIds.length), [40, 23, 16, 20, 1])
    ensure(new Set(professionals.map(row => row.id)).size === 100 && records.every(row => row.colab_id === null), 'E3_LINK_STATE_CHANGED')
    ensure(pairs.length === 395 && new Set(pairs.map(row => row.recordId)).size === 395 &&
        allPairs.length === 440 && new Set(allPairs.map(row => row.recordId)).size === 440, 'E3_RECORD_PROPOSAL_CHANGED')
    for (const pair of pairs) {
        const record = records.find(row => row.id === pair.recordId), person = professionals.find(row => row.id === pair.professionalId)
        ensure(record && person && typeof record.colab === 'string' && Buffer.from(record.colab).equals(Buffer.from(person.colab)) &&
            allPairs.some(row => row.recordId === pair.recordId && row.professionalId === pair.professionalId), 'E3_NONEXACT_OR_INVALID_PAIR')
    }
    const linked = new Set(pairs.map(row => row.recordId)), candidates = new Set(allPairs.map(row => row.recordId))
    const pending = records.filter(row => !linked.has(row.id)).map(row => ({ id: row.id, reason: candidates.has(row.id) ? 'collation-only' : 'no-candidate' }))
    ensure(pending.filter(row => row.reason === 'collation-only').length === 45 && pending.filter(row => row.reason === 'no-candidate').length === 58, 'E3_PENDING_CHANGED')
    return { groups, pairs: [...pairs].sort((a, b) => a.recordId - b.recordId), pending }
}

async function applyMap(db, proposal, originals, rollback) {
    let open = false
    try {
        await db.beginTransaction(); open = true
        const [users] = await db.query('SELECT * FROM ??.users2 ORDER BY id FOR UPDATE', [TARGET]); assert.deepEqual(users, originals.accounts)
        const [people] = await db.query('SELECT * FROM ??.colab ORDER BY id FOR UPDATE', [TARGET]); assert.deepEqual(people, originals.professionals)
        const [records] = await db.query('SELECT * FROM ??.registros ORDER BY id FOR UPDATE', [TARGET]); assert.deepEqual(records, originals.records)
        const [[empty]] = await db.query('SELECT COUNT(*) AS n FROM ??.gerencias', [TARGET]); ensure(Number(empty.n) === 0, 'E3_DEPARTMENTS_NOT_EMPTY')
        const [[clock]] = await db.query("SELECT DATE_FORMAT(CURRENT_TIMESTAMP,'%Y-%m-%d %H:%i:%s') AS instant")
        const departments = []
        for (const group of proposal.groups) {
            const row = { id: group.id, nome: group.name, demandante_id: 12, deletedAt: null, created_at: clock.instant, updated_at: clock.instant }
            const [inserted] = await db.query('INSERT INTO ??.gerencias (id,nome,demandante_id,deletedAt,created_at,updated_at) VALUES (?,?,?,?,?,?)',
                [TARGET, row.id, row.nome, 12, null, row.created_at, row.updated_at]); ensure(inserted.affectedRows === 1, 'E3_MAP_INSERT_FAILED')
            departments.push(row)
            for (const id of group.professionalIds) {
                const [changed] = await db.query('UPDATE ??.colab SET gerencia_id=? WHERE id=? AND gerencia_id IS NULL', [TARGET, group.id, id])
                ensure(changed.affectedRows === 1, 'E3_PROFESSIONAL_UPDATE_FAILED')
            }
        }
        for (const pair of proposal.pairs) {
            const original = originals.records.find(row => row.id === pair.recordId)
            const [changed] = await db.query('UPDATE ??.registros SET colab_id=? WHERE id=? AND colab_id IS NULL AND CAST(colab AS BINARY)=CAST(? AS BINARY)',
                [TARGET, pair.professionalId, pair.recordId, original.colab])
            ensure(changed.affectedRows === 1, 'E3_RECORD_UPDATE_FAILED')
        }
        if (rollback) await db.rollback(); else await db.commit()
        open = false
        return departments
    } finally { if (open) await db.rollback() }
}

function expectedRows(originals, proposal, departments) {
    return {
        colab: originals.professionals.map(row => ({ ...row, gerencia_id: proposal.groups.find(group => group.professionalIds.includes(row.id)).id })),
        registros: originals.records.map(row => ({ ...row, colab_id: proposal.pairs.find(pair => pair.recordId === row.id)?.professionalId ?? null })),
        gerencias: departments
    }
}

function compareSnapshots(before, after, changedRows = {}, schemaApplied = false, ledgerRows) {
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort())
    for (const [name, baseline] of Object.entries(before)) {
        const actual = after[name], expected = { ...baseline }
        if (changedRows[name]) { expected.count = changedRows[name].length; expected.digest = digest(changedRows[name]) }
        if (name === 'gerencias') {
            ensure(auto(actual.ddl) >= 1 && auto(actual.ddl) <= 6, 'E3_DEPARTMENT_COUNTER_CHANGED')
            expected.ddl = normalAuto(expected.ddl); assert.deepEqual({ ...actual, ddl: normalAuto(actual.ddl) }, expected)
        } else if (name === LEDGER && schemaApplied) {
            ensure(ledgerRows?.length === 3 && auto(actual.ddl) === 4, 'E3_LEDGER_CHANGED')
            expected.count = 3; expected.digest = digest(ledgerRows); expected.ddl = normalAuto(expected.ddl)
            assert.deepEqual({ ...actual, ddl: normalAuto(actual.ddl) }, expected)
        } else {
            if (name === 'colab' && schemaApplied) {
                ensure(expected.ddl.includes('`gerencia_id` int unsigned DEFAULT NULL'), 'E3_COLUMN_BASELINE_CHANGED')
                expected.ddl = expected.ddl.replace('`gerencia_id` int unsigned DEFAULT NULL', '`gerencia_id` int unsigned NOT NULL')
            }
            assert.deepEqual(actual, expected)
        }
    }
}

function compareCatalog(before, after, schemaApplied) {
    const expected = structuredClone(before)
    if (schemaApplied) {
        const column = expected.columns.find(row => row.t === 'colab' && row.name === 'gerencia_id')
        ensure(column?.type === 'int unsigned' && column.nullable === 'YES', 'E3_COLUMN_BASELINE_CHANGED')
        column.nullable = 'NO'
    }
    assert.deepEqual(after, expected)
}

function migrationSource() {
    return {
        async getMigrations() { return [...migrationNames] },
        getMigrationName(name) { ensure(migrationNames.includes(name), 'E3_MIGRATION_REFUSED'); return name },
        async getMigration(name) { ensure(migrationNames.includes(name), 'E3_MIGRATION_REFUSED'); return require(path.join(__dirname, '../compat/inova/migrations', name)) }
    }
}

async function assertControl(db, permitted) {
    const [clients] = await db.query("SELECT PROCESSLIST_ID AS id,PROCESSLIST_DB AS db FROM performance_schema.threads WHERE TYPE='FOREGROUND' AND PROCESSLIST_ID IS NOT NULL")
    ensure(clients.some(row => Number(row.id) === [...permitted][0]) && clients.filter(row => row.db === TARGET).every(row => permitted.has(Number(row.id))), 'E3_CONCURRENT_COPY_CLIENT')
    const [locks] = await db.query('SELECT t.PROCESSLIST_ID AS id FROM performance_schema.metadata_locks l JOIN performance_schema.threads t ON t.THREAD_ID=l.OWNER_THREAD_ID WHERE l.OBJECT_SCHEMA=?', [TARGET])
    ensure(locks.every(row => permitted.has(Number(row.id))), 'E3_CONCURRENT_COPY_LOCK')
    const [[owner]] = await db.query('SELECT IS_USED_LOCK(?) AS id', [lockName]); ensure(Number(owner.id) === [...permitted][0], 'E3_LOCK_LOST')
}

async function assertPortFree(port, host = '127.0.0.1') {
    await new Promise((resolve, reject) => {
        const probe = net.createServer()
        probe.once('error', error => {
            if (host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) return resolve()
            reject(Object.assign(new Error('Preview port unavailable'), { code: 'E3_PREVIEW_PORT_BUSY' }))
        })
        probe.listen({ port, host, ipv6Only: host === '::1' }, () => probe.close(resolve))
    })
}
async function assertPreviewPortsFree() { for (const port of [5174, 8002]) for (const host of ['127.0.0.1', '::1']) await assertPortFree(port, host) }

async function connect(config, database = TARGET) {
    return mysql.createConnection({ ...config, database, connectTimeout: 3000, multipleStatements: false, debug: false, trace: false,
        charset: 'utf8mb4', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true })
}

async function validateScopes(db, accounts, proposal) {
    const records = createRecords(db), owner = accounts.find(row => row.id === 12), admin = accounts.find(row => isAdmin(row) && row.id !== 12),
        other = accounts.find(row => !isAdmin(row) && row.id !== 12)
    ensure(owner && admin && other, 'E3_SCOPE_ACTORS_MISSING')
    const counts = []
    for (const [role, actor] of [['chosen-owner', owner], ['administrator', admin], ['unassigned-evaluator', other]]) {
        const user = { ...publicUser(actor), session_version: actor.session_version }
        const expected = isAdmin(actor) ? 498 : actor.id === 12 ? 395 : 0
        const people = await professionalScope(db('colab').select('id'), user, db)
        assert.equal(people.length, isAdmin(actor) || actor.id === 12 ? 100 : 0)
        let body, status = 200
        const res = { json(value) { body = value }, status(value) { status = value; return this }, send() {} }
        await records.getReg({ user, query: {} }, res); assert.equal(status, 200); assert.equal(body.length, expected)
        await records.getRegById({ user, params: { id: String(proposal.pending[0].id) } }, res)
        assert.equal(status, isAdmin(actor) ? 200 : 404)
        counts.push({ actor: role, recordsVisible: expected })
    }
    return counts
}

async function run({ action, profile, config, directory, confirmation, secret, backupKey, progress = () => {}, storage = fs, connector = connect, client = mysqlClient }) {
    assertStage(profile, config, confirmation)
    ensure(['preflight', 'apply'].includes(action) && /^[a-f0-9]{64}$/.test(secret || '') && Buffer.isBuffer(backupKey) && backupKey.length === 32, 'E3_OPTIONS_REFUSED')
    ensure(files.every(name => !storage.existsSync(path.join(directory, name))), 'E3_ARTIFACT_EXISTS')
    await assertPreviewPortsFree()
    const identity = privateIdentity(profile)
    const original = loadPrivate(directory, profile, secret, 'manifest.evalinventory', identity, storage)
    const e2Before = loadPrivate(directory, profile, secret, 'access-e2b-before.evalinventory', identity + ':e2b:access-e2b-before.evalinventory', storage)
    const e2After = loadPrivate(directory, profile, secret, 'access-e2b-activation.evalinventory', identity + ':e2b:access-e2b-activation.evalinventory', storage)
    const e1After = loadPrivate(directory, profile, secret, 'compat-e1-structures.evalinventory', identity + ':e1:compat-e1-structures.evalinventory', storage)
    ensure(original.profileId === profile.id && original.source === SOURCE && original.target === TARGET && original.serverUuid === profile.serverUuid &&
        e2Before.profileId === profile.id && e2Before.target === TARGET && e2Before.serverUuid === profile.serverUuid &&
        e2After.profileId === profile.id && e2After.target === TARGET && e2After.preservedHashesAndProfiles === true && e1After.profileId === profile.id && e1After.target === TARGET, 'E3_MANIFEST_CHANGED')
    const tables = Object.keys(e2After.after).sort(); ensure(tables.length === 14, 'E3_BASELINE_CHANGED')
    let db, source, knex, locked = false, started = false, mapCommitted = false, schemaApplied = false, cnfCreated = false, stage = 'preflight'
    const mark = value => { stage = value; progress(value) }, cnf = path.join(directory, 'client-maps-e3.cnf')
    const writePrivate = (name, details) => storage.writeFileSync(path.join(directory, name), JSON.stringify(encryptDetails(details, secret, identity + ':e3:' + name, profile.id)), { flag: 'wx', mode: 0o600 })
    try {
        db = await connector(config)
        const [[server]] = await db.query('SELECT DATABASE() AS name,@@port AS port,@@server_uuid AS uuid,VERSION() AS version,@@sql_mode AS sqlMode,CONNECTION_ID() AS id')
        checkServer(server, profile)
        const [[lock]] = await db.query('SELECT GET_LOCK(?,0) AS acquired', [lockName]); ensure(Number(lock.acquired) === 1, 'E3_LOCK_BUSY'); locked = true
        const permitted = new Set([Number(server.id)]), control = () => assertControl(db, permitted)
        await control()
        const [grants] = await db.query('SHOW GRANTS'), allows = grantPrivileges(grants, TARGET)
        const missingPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'CREATE', 'ALTER', 'INDEX', 'REFERENCES', 'LOCK TABLES', 'TRIGGER'].filter(name => !allows(name))
        compareCatalog(e1After.after, await catalog(db), false)
        for (const [name, column] of [['TRIGGERS', 'TRIGGER_SCHEMA'], ['ROUTINES', 'ROUTINE_SCHEMA'], ['EVENTS', 'EVENT_SCHEMA']]) {
            const [[row]] = await db.query('SELECT COUNT(*) AS n FROM information_schema.?? WHERE ??=?', [name, column, TARGET]); ensure(Number(row.n) === 0, 'E3_UNEXPECTED_OBJECT')
        }
        const [ledgerBefore] = await db.query('SELECT * FROM ??.?? ORDER BY id', [TARGET, LEDGER])
        assert.deepEqual(ledgerBefore.map(row => ({ name: row.name, batch: row.batch })), e1Names.map(name => ({ name, batch: 1 })))
        const before = await lockedSnapshot(db, TARGET, tables); assert.deepEqual(before, e2After.after)
        ensure(before.gerencias.count === 0 && auto(before.gerencias.ddl) === 1, 'E3_DEPARTMENTS_ALREADY_USED')
        ensure(before.colab.ddl.includes('`gerencia_id` int unsigned DEFAULT NULL') && auto(before[LEDGER].ddl) === 3, 'E3_DDL_BASELINE_CHANGED')
        const [accounts] = await db.query('SELECT * FROM ??.users2 ORDER BY id', [TARGET])
        assert.deepEqual(accounts, e2Before.accounts.map(row => ({ ...row, active: 1, session_version: 1 })))
        const [professionals] = await db.query('SELECT * FROM ??.colab ORDER BY id', [TARGET])
        const [records] = await db.query('SELECT * FROM ??.registros ORDER BY id', [TARGET])
        const baseJoin = 'SELECT r.id AS recordId,c.id AS professionalId FROM ??.registros r JOIN ??.colab c ON c.colab=r.colab WHERE r.colab_id IS NULL'
        const [allPairs] = await db.query(baseJoin + ' ORDER BY r.id,c.id', [TARGET, TARGET])
        const [pairs] = await db.query(baseJoin + ' AND CAST(r.colab AS BINARY)=CAST(c.colab AS BINARY) ORDER BY r.id,c.id', [TARGET, TARGET])
        const proposal = proposalFrom(professionals, records, pairs, allPairs, accounts), originals = { accounts, professionals, records }
        source = await connector(config, SOURCE)
        assert.deepEqual(await lockedSnapshot(source, SOURCE, Object.keys(original.before).sort()), original.before)
        const preflight = { success: true, ready: !missingPrivileges.length, target: TARGET, tables: 14, rows: Object.values(before).reduce((n, row) => n + row.count, 0),
            groups: proposal.groups.map(row => ({ alias: row.alias, professionals: row.professionalIds.length, ownerAccountId: 12 })), recordsToLink: 395, recordsPending: 103,
            accountsPreserved: 25, missingPrivileges, sourceUnchanged: true, previewPortsFree: true, mapsApplied: false, completedUtc: new Date().toISOString() }
        if (action === 'preflight') return preflight
        ensure(preflight.ready, 'E3_PRIVILEGES_MISSING'); await control(); started = true; mark('backup-post-e2b')
        let dump, readback
        await lockRead(db, TARGET, tables)
        try {
            assert.deepEqual(await snapshot(db, TARGET, tables), before)
            storage.writeFileSync(cnf, '[client]\nhost=127.0.0.1\nport=3306\nprotocol=TCP\nuser=' + quoteOption(config.user) + '\npassword=' + quoteOption(config.password) + '\n', { flag: 'wx', mode: 0o600 }); cnfCreated = true
            dump = client('C:/Program Files/MySQL/MySQL Server 8.0/bin', 'mysqldump', cnf, [...dumpOptions, TARGET, ...tables]); assertDump(dump, tables)
            const backupIdentity = profile.id + ':' + TARGET + ':e3'
            storage.writeFileSync(path.join(directory, 'maps-e3-before.evalbackup'), JSON.stringify(seal(dump, backupKey, backupIdentity)), { flag: 'wx', mode: 0o600 })
            readback = unseal(JSON.parse(storage.readFileSync(path.join(directory, 'maps-e3-before.evalbackup'), 'utf8')), backupKey, backupIdentity)
            ensure(createHash('sha256').update(dump).digest('hex') === createHash('sha256').update(readback).digest('hex'), 'E3_BACKUP_MISMATCH')
            assert.deepEqual(await snapshot(db, TARGET, tables), before)
            writePrivate('maps-e3-before.evalinventory', { profileId: profile.id, target: TARGET, serverUuid: profile.serverUuid, before, originals, beforeCatalog: e1After.after, ledgerBefore, backupIdentity })
            writePrivate('maps-e3-proposal.evalinventory', { profileId: profile.id, target: TARGET, proposal })
        } finally { dump?.fill(0); readback?.fill(0); await db.query('UNLOCK TABLES'); if (cnfCreated) { storage.unlinkSync(cnf); cnfCreated = false } }
        await control(); mark('map-rollback-rehearsal')
        await applyMap(db, proposal, originals, true)
        compareSnapshots(before, await lockedSnapshot(db, TARGET, tables))
        await control(); mark('apply-approved-map')
        const departments = await applyMap(db, proposal, originals, false); mapCommitted = true
        const changedRows = expectedRows(originals, proposal, departments)
        compareSnapshots(before, await lockedSnapshot(db, TARGET, tables), changedRows)
        compareCatalog(e1After.after, await catalog(db), false)
        await control(); mark('third-compatibility-migration')
        knex = knexFactory({ client: 'mysql', connection: { ...config, database: TARGET, dateStrings: true }, pool: { min: 0, max: 1 },
            log: { warn() {}, error() {}, debug() {}, deprecate() {} } })
        authorize(knex, profile, confirmation)
        const [[worker]] = await knex.raw('SELECT CONNECTION_ID() AS id'); permitted.add(Number(worker.id)); await control()
        await knex.raw('SET SESSION lock_wait_timeout=5')
        const [batch, applied] = await knex.migrate.latest({ tableName: LEDGER, schemaName: TARGET, disableTransactions: true, migrationSource: migrationSource() })
        ensure(batch === 2, 'E3_MIGRATION_BATCH_CHANGED'); assert.deepEqual(applied, [third]); schemaApplied = true
        const [ledgerAfter] = await db.query('SELECT * FROM ??.?? ORDER BY id', [TARGET, LEDGER])
        assert.deepEqual(ledgerAfter.slice(0, 2), ledgerBefore)
        ensure(ledgerAfter.length === 3 && ledgerAfter[2].name === third && ledgerAfter[2].batch === 2 && ledgerAfter[2].id === 3, 'E3_LEDGER_CHANGED')
        const afterCatalog = await catalog(db); compareCatalog(e1After.after, afterCatalog, true)
        const after = await lockedSnapshot(db, TARGET, tables); compareSnapshots(before, after, changedRows, true, ledgerAfter)
        mark('verify-sql-authorization-scopes')
        const scopes = await validateScopes(knex, accounts, proposal)
        assert.deepEqual(await lockedSnapshot(source, SOURCE, Object.keys(original.before).sort()), original.before)
        writePrivate('maps-e3-applied.evalinventory', { profileId: profile.id, target: TARGET, serverUuid: profile.serverUuid, after, afterCatalog, ledgerAfter, canServePreview: true })
        const report = { success: true, target: TARGET, backupTables: 14, backupRows: preflight.rows, backupAuthenticated: true, rollbackVerified: true,
            departmentsCreated: 5, ownerAccountId: 12, professionalsLinked: 100, recordsLinked: 395, recordsPending: 103, pendingCollationOnly: 45, pendingWithoutCandidate: 58,
            accountsAndHashesPreserved: 25, historicalFieldsPreserved: true, sourceUnchanged: true, legacyLedgerEntriesPreserved: 7,
            compatibilityMigrations: 3, newMigrationBatch: 2, departmentRequired: true, unsignedAndForeignKeysPreserved: true,
            sqlAuthorizationScopes: scopes, operationalLoginsAttempted: 0, previewNotYetStarted: true, completedUtc: new Date().toISOString() }
        storage.writeFileSync(path.join(directory, 'maps-e3-report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 }); return report
    } catch (error) {
        if (started) storage.writeFileSync(path.join(directory, 'maps-e3-failure.json'), JSON.stringify({ success: false, stage, target: TARGET,
            mapCommitted, schemaApplied, preserveAllArtifacts: true, automaticRetry: false }), { flag: 'wx', mode: 0o600 })
        throw error
    } finally {
        try { if (knex) await knex.destroy() }
        finally { try { if (locked) await db.query('SELECT RELEASE_LOCK(?)', [lockName]) }
            finally { source?.destroy(); db?.destroy(); if (cnfCreated) storage.unlinkSync(cnf) } }
    }
}

let stage = 'configuration'
async function main() {
    const directory = fs.realpathSync(process.argv[3])
    ensure(directory.toLowerCase() === path.resolve(process.env.LOCALAPPDATA || '', 'EvaluationDev/inova-nucleo-compat-20261029').toLowerCase(), 'E3_DIRECTORY_REFUSED')
    const profile = JSON.parse(fs.readFileSync(path.join(directory, 'profile.json'), 'utf8').replace(/^\uFEFF/, ''))
    const config = staticConnection(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8'))
    ensure(/^[a-f0-9]{64}$/.test(process.env.EVAL_LOCAL_COPY_BACKUP_KEY || ''), 'E3_KEYS_REQUIRED')
    const backupKey = Buffer.from(process.env.EVAL_LOCAL_COPY_BACKUP_KEY, 'hex')
    try { console.log(JSON.stringify(await run({ action: process.argv[2], profile, config, directory, backupKey,
        secret: process.env.EVAL_LOCAL_COPY_INVENTORY_SECRET, confirmation: process.env.EVAL_LOCAL_MAPS_CONFIRMATION,
        progress(value) { stage = value; console.log(JSON.stringify({ stage: value })) } }))) }
    finally { backupKey.fill(0) }
}
if (require.main === module) main().catch(error => {
    console.error(JSON.stringify({ success: false, stage, code: /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'E3_MAPS_FAILED',
        location: Number(error.stack?.match(/local-inova-maps\.js:(\d+):\d+/)?.[1] || 0), privateDiagnosticsSuppressed: true }))
    process.exitCode = 1
})
module.exports = { run, proposalFrom, applyMap, expectedRows, compareSnapshots, compareCatalog, migrationSource, migrationNames, third,
    assertStage, assertControl, assertPortFree, assertPreviewPortsFree, connect, loadPrivate, privateIdentity, validateScopes, digest, normalAuto, E3_CONFIRMATION, files }
