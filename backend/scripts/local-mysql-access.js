// E2B: only the approved fictitious copy. No bootstrap, shared migrations,
// account-password reset, grant, business-map change or persistent HTTP server.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { randomBytes, createHash } = require('node:crypto')
const mysql = require('mysql2/promise')
const { SOURCE, TARGET, CONFIRMATION, assertScope, staticConnection, grantPrivileges, lockRead, snapshot,
    quoteOption, dumpOptions, assertDump } = require('./local-mysql-copy')
const { encryptDetails, decryptDetails } = require('./isolated-inventory')
const { seal, unseal, mysqlClient } = require('./isolated-recovery')
const { catalog, verifyHistorical, verifyEmptyAdditions, migrationNames, LEDGER } = require('./local-mysql-compat')
const { isLegacyHash } = require('../lib/auth/legacy-bcrypt-format')
const { normalizeEmail } = require('../lib/auth/identity')
const { fixtures, names, ensure } = require('./local-access-guard')
const { validateFixtures } = require('./local-access-fixtures')

const E2B_CONFIRMATION = TARGET + ':3306:access-e2b-all25'
const lockName = 'evaluation:inova-compat:20261029:e2b'
const artifacts = ['access-e2b-before.evalbackup', 'access-e2b-before.evalinventory', 'access-e2b-activation.evalinventory',
    'access-e2b-report.json', 'access-e2b-failure.json', 'client-access-e2b.cnf']
const digest = rows => createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex')

function scope(profile, config, confirmation) {
    assertScope(profile, CONFIRMATION)
    ensure(confirmation === E2B_CONFIRMATION, 'E2B_CONFIRMATION_REQUIRED')
    ensure(config.host === '127.0.0.1' && config.port === 3306 && config.database === SOURCE, 'E2B_CONFIG_REFUSED')
}

function checkAccounts(accounts, reviewed) {
    ensure(accounts.length === 25 && reviewed.length === 25, 'E2B_ACCOUNT_MAP_CHANGED')
    ensure(new Set(accounts.map(row => row.id)).size === 25 && accounts.filter(row => row.admin === 1).length === 2, 'E2B_ACCOUNT_MAP_CHANGED')
    const emails = new Set()
    for (const row of accounts) {
        ensure(Number.isSafeInteger(row.id) && row.id > 0 && row.active === 0 && row.session_version === 0 &&
            row.deletedAt === null && [0, 1].includes(row.admin) && isLegacyHash(row.password) && normalizeEmail(row.email) === row.email,
        'E2B_ACCOUNT_STATE_CHANGED')
        ensure(!emails.has(row.email), 'E2B_ACCOUNT_STATE_CHANGED'); emails.add(row.email)
        const previous = reviewed.find(item => item.id === row.id)
        ensure(previous && ['id', 'name', 'email', 'admin', 'deletedAt'].every(key => previous[key] === row[key]), 'E2B_ACCOUNT_MAP_CHANGED')
    }
}

function checkServer(server, profile) {
    ensure(server.name === TARGET && Number(server.port) === 3306 && server.uuid === profile.serverUuid && server.version === '8.0.44' &&
        typeof server.sqlMode === 'string' && !server.sqlMode.split(',').includes('NO_BACKSLASH_ESCAPES'), 'E2B_SERVER_CHANGED')
}

function checkLedger(entries) {
    assert.deepEqual(entries, migrationNames.map(name => ({ name, batch: 1 })))
}

async function assertControl(db, permitted) {
    const [threads] = await db.query("SELECT PROCESSLIST_ID AS id,PROCESSLIST_DB AS db FROM performance_schema.threads WHERE TYPE='FOREGROUND' AND PROCESSLIST_ID IS NOT NULL")
    ensure(threads.some(row => Number(row.id) === [...permitted][0]), 'E2B_SESSION_VISIBILITY_REQUIRED')
    ensure(threads.filter(row => row.db === TARGET).every(row => permitted.has(Number(row.id))), 'E2B_OTHER_COPY_CONNECTION')
    const [locks] = await db.query('SELECT t.PROCESSLIST_ID AS id FROM performance_schema.metadata_locks l JOIN performance_schema.threads t ON t.THREAD_ID=l.OWNER_THREAD_ID WHERE l.OBJECT_SCHEMA=?', [TARGET])
    ensure(locks.every(row => permitted.has(Number(row.id))), 'E2B_OTHER_COPY_LOCK')
    const [[owner]] = await db.query('SELECT IS_USED_LOCK(?) AS id', [lockName])
    ensure(Number(owner.id) === [...permitted][0], 'E2B_CONTROL_LOCK_LOST')
}

async function lockedSnapshot(db, database, tables) {
    await lockRead(db, database, tables)
    try { return await snapshot(db, database, tables) }
    finally { await db.query('UNLOCK TABLES') }
}

async function activateAccounts(db, expected, rollback) {
    ensure(expected.length === 25 && new Set(expected.map(row => row.id)).size === 25, 'E2B_ACCOUNT_MAP_CHANGED')
    let open = false
    try {
        await db.beginTransaction(); open = true
        const [current] = await db.query('SELECT * FROM ??.users2 ORDER BY id FOR UPDATE', [TARGET])
        assert.deepEqual(current, expected)
        checkAccounts(current, expected)
        for (const row of expected) {
            const [result] = await db.query('UPDATE ??.users2 SET active=1,session_version=1 WHERE id=? AND active=0 AND session_version=0 AND BINARY password=? AND admin=? AND deletedAt IS NULL',
                [TARGET, row.id, row.password, row.admin])
            ensure(result.affectedRows === 1, 'E2B_CONDITIONAL_ACTIVATION_FAILED')
        }
        if (rollback) await db.rollback()
        else await db.commit()
        open = false
        return 25
    } finally { if (open) await db.rollback() }
}

async function dropOwnedFixture(db, name, runId, created) {
    ensure(names.includes(name) && /^[a-f0-9]{32}$/.test(runId) && created.has(name), 'E2B_FIXTURE_NOT_OWNED')
    const [[row]] = await db.query('SELECT TABLE_COMMENT AS marker, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?', [TARGET, name])
    ensure(row?.marker === 'evaluation-e2b:' + runId && row.engine === 'InnoDB', 'E2B_FIXTURE_NOT_OWNED')
    await db.query('DROP TABLE ??.??', [TARGET, name])
    created.delete(name)
}

function readPrivate(storage, directory, name, secret, identity, id) {
    return decryptDetails(JSON.parse(storage.readFileSync(path.join(directory, name), 'utf8')), secret, identity, id)
}

async function connect(config, database) {
    return mysql.createConnection({ ...config, database, connectTimeout: 3000, multipleStatements: false,
        debug: false, trace: false, charset: 'utf8mb4', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true })
}

async function run({ action, profile, config, directory, confirmation, secret, backupKey, progress = () => {},
    storage = fs, connector = connect, fixtureValidator = validateFixtures, client = mysqlClient }) {
    ensure(['preflight', 'activate'].includes(action), 'E2B_ACTION_REFUSED')
    scope(profile, config, confirmation)
    ensure(/^[a-f0-9]{64}$/.test(secret || '') && Buffer.isBuffer(backupKey) && backupKey.length === 32, 'E2B_KEYS_REQUIRED')
    ensure(artifacts.every(name => !storage.existsSync(path.join(directory, name))), 'E2B_ARTIFACT_EXISTS')
    const identity = profile.id + ':' + SOURCE + ':' + TARGET
    const baseline = readPrivate(storage, directory, 'manifest.evalinventory', secret, identity, profile.id)
    const e1Before = readPrivate(storage, directory, 'compat-e1-before.evalinventory', secret, identity + ':e1:compat-e1-before.evalinventory', profile.id)
    const e1After = readPrivate(storage, directory, 'compat-e1-structures.evalinventory', secret, identity + ':e1:compat-e1-structures.evalinventory', profile.id)
    const reviewed = readPrivate(storage, directory, 'candidates.evalinventory', secret, identity + ':candidates-v1', profile.id)
    ensure(baseline.profileId === profile.id && baseline.serverUuid === profile.serverUuid && baseline.source === SOURCE && baseline.target === TARGET &&
        e1Before.profileId === profile.id && e1Before.target === TARGET && e1After.profileId === profile.id && e1After.target === TARGET &&
        e1After.historicalContentMatches === true, 'E2B_MANIFEST_IDENTITY_CHANGED')
    assert.deepEqual(e1Before.baseline, baseline.before)
    const tables = e1After.after.tables.map(row => row.name).sort()
    ensure(tables.length === 14 && !tables.some(name => names.includes(name)), 'E2B_BASELINE_CHANGED')
    let db, source, controlLocked = false, currentStage = 'preflight', started = false, committed = false, cnfCreated = false
    const created = new Set(), runId = randomBytes(16).toString('hex')
    const cnf = path.join(directory, 'client-access-e2b.cnf')
    const mark = value => { currentStage = value; progress(value) }
    const privateFile = (name, data) => storage.writeFileSync(path.join(directory, name), JSON.stringify(encryptDetails(data, secret, identity + ':e2b:' + name, profile.id)), { flag: 'wx', mode: 0o600 })
    try {
        db = await connector(config, TARGET)
        const [[server]] = await db.query('SELECT DATABASE() AS name,@@port AS port,@@server_uuid AS uuid,VERSION() AS version,@@sql_mode AS sqlMode,CONNECTION_ID() AS id')
        checkServer(server, profile)
        const [[lock]] = await db.query('SELECT GET_LOCK(?,0) AS acquired', [lockName])
        ensure(Number(lock.acquired) === 1, 'E2B_CONTROL_BUSY'); controlLocked = true
        const permitted = new Set([Number(server.id)]), control = () => assertControl(db, permitted)
        await control()
        const [grants] = await db.query('SHOW GRANTS'), allows = grantPrivileges(grants, TARGET)
        const missingPrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'LOCK TABLES', 'TRIGGER'].filter(name => !allows(name))
        assert.deepEqual(await catalog(db), e1After.after)
        for (const [name, column] of [['TRIGGERS', 'TRIGGER_SCHEMA'], ['ROUTINES', 'ROUTINE_SCHEMA'], ['EVENTS', 'EVENT_SCHEMA']]) {
            const [[row]] = await db.query('SELECT COUNT(*) AS n FROM information_schema.?? WHERE ??=?', [name, column, TARGET])
            ensure(Number(row.n) === 0, 'E2B_UNEXPECTED_DATABASE_OBJECT')
        }
        await verifyHistorical(db, baseline.before, e1Before.before, 'structures')
        await verifyEmptyAdditions(db)
        const [entries] = await db.query('SELECT name,batch FROM ??.?? ORDER BY id', [TARGET, LEDGER])
        checkLedger(entries)
        const [accounts] = await db.query('SELECT * FROM ??.users2 ORDER BY id', [TARGET])
        checkAccounts(accounts, reviewed.users)
        const before = await lockedSnapshot(db, TARGET, tables)
        source = await connector(config, SOURCE)
        assert.deepEqual(await lockedSnapshot(source, SOURCE, Object.keys(baseline.before).sort()), baseline.before)
        const preflight = { success: true, ready: !missingPrivileges.length, target: TARGET, tables: 14,
            rows: Object.values(before).reduce((sum, table) => sum + table.count, 0), accounts: 25, activeAccounts: 0,
            reviewedAccountMapMatches: true, e1StateMatches: true, sourceUnchanged: true, missingPrivileges,
            fixtureTablesAbsent: true, accountsChanged: false, applicationSwitched: false, completedUtc: new Date().toISOString() }
        if (action === 'preflight') return preflight
        ensure(preflight.ready, 'E2B_PRIVILEGES_MISSING')
        await control(); mark('backup-post-e1'); started = true
        let dump, readback
        await lockRead(db, TARGET, tables)
        try {
            assert.deepEqual(await snapshot(db, TARGET, tables), before)
            storage.writeFileSync(cnf, '[client]\nhost=127.0.0.1\nport=3306\nprotocol=TCP\nuser=' + quoteOption(config.user) + '\npassword=' + quoteOption(config.password) + '\n', { flag: 'wx', mode: 0o600 }); cnfCreated = true
            dump = client('C:/Program Files/MySQL/MySQL Server 8.0/bin', 'mysqldump', cnf, [...dumpOptions, TARGET, ...tables])
            assertDump(dump, tables)
            const backupIdentity = profile.id + ':' + TARGET + ':e2b'
            storage.writeFileSync(path.join(directory, 'access-e2b-before.evalbackup'), JSON.stringify(seal(dump, backupKey, backupIdentity)), { flag: 'wx', mode: 0o600 })
            readback = unseal(JSON.parse(storage.readFileSync(path.join(directory, 'access-e2b-before.evalbackup'), 'utf8')), backupKey, backupIdentity)
            ensure(createHash('sha256').update(dump).digest('hex') === createHash('sha256').update(readback).digest('hex'), 'E2B_BACKUP_MISMATCH')
            assert.deepEqual(await snapshot(db, TARGET, tables), before)
            privateFile('access-e2b-before.evalinventory', { profileId: profile.id, target: TARGET, serverUuid: profile.serverUuid, runId,
                before, accounts, allowedFixtures: names, backupIdentity, backupSha256: createHash('sha256').update(readback).digest('hex') })
        } finally {
            dump?.fill(0); readback?.fill(0)
            await db.query('UNLOCK TABLES')
            if (cnfCreated) { storage.unlinkSync(cnf); cnfCreated = false }
        }
        await control(); mark('create-owned-fixtures')
        let fixtureReport
        try {
            for (const [original, name] of Object.entries(fixtures)) {
                await control()
                await db.query('CREATE TABLE ??.?? LIKE ??.??', [TARGET, name, TARGET, original]); created.add(name)
                await db.query('ALTER TABLE ??.?? COMMENT=?', [TARGET, name, 'evaluation-e2b:' + runId])
            }
            fixtureReport = await fixtureValidator({ config, profile, control: db, permitted, assertControl: control, progress: mark })
        } finally {
            mark('cleanup-owned-fixtures')
            for (const name of [...created]) { await control(); await dropOwnedFixture(db, name, runId, created) }
        }
        ensure(fixtureReport?.realHttpAndSqlPassed, 'E2B_FIXTURES_NOT_PASSED')
        await control(); assert.deepEqual(await catalog(db), e1After.after)
        assert.deepEqual(await lockedSnapshot(db, TARGET, tables), before)
        mark('activation-rollback-rehearsal')
        assert.equal(await activateAccounts(db, accounts, true), 25)
        assert.deepEqual(await lockedSnapshot(db, TARGET, tables), before)
        await control(); mark('activate-exactly-25-accounts')
        // Revalidate every table after the rehearsal, before entering the final
        // account transaction. The account rows are checked again under lock.
        assert.deepEqual(await lockedSnapshot(db, TARGET, tables), before)
        assert.equal(await activateAccounts(db, accounts, false), 25); committed = true
        const expectedAccounts = accounts.map(row => ({ ...row, active: 1, session_version: 1 }))
        const [afterAccounts] = await db.query('SELECT * FROM ??.users2 ORDER BY id', [TARGET])
        assert.deepEqual(afterAccounts, expectedAccounts)
        const expected = { ...before, users2: { ...before.users2, digest: digest(expectedAccounts) } }
        const after = await lockedSnapshot(db, TARGET, tables)
        assert.deepEqual(after, expected)
        assert.deepEqual(await catalog(db), e1After.after)
        assert.deepEqual(await lockedSnapshot(source, SOURCE, Object.keys(baseline.before).sort()), baseline.before)
        privateFile('access-e2b-activation.evalinventory', { profileId: profile.id, target: TARGET, runId, after,
            activatedIds: accounts.map(row => row.id), preservedHashesAndProfiles: true })
        const report = { success: true, target: TARGET, backupTables: 14, backupRows: preflight.rows,
            backupAuthenticated: true, fixtures: fixtureReport, fixtureTablesRemoved: 3, originalStatePreservedBeforeActivation: true,
            activationRollbackVerified: true, accountsActivated: 25, sessionVersion: 1, administrativeProfilesPreserved: 2,
            hashesPreserved: 25, otherFieldsAndTablesPreserved: true, sourceUnchanged: true,
            professionals: 100, records: 498, assignmentsChanged: 0, operationalLoginsAttempted: 0,
            migrationsExecuted: 0, privilegesChanged: false, applicationSwitched: false, ephemeralServerStopped: true,
            completedUtc: new Date().toISOString() }
        storage.writeFileSync(path.join(directory, 'access-e2b-report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
        return report
    } catch (error) {
        if (started) storage.writeFileSync(path.join(directory, 'access-e2b-failure.json'), JSON.stringify({ success: false,
            target: TARGET, stage: currentStage, activationCommitted: committed, ownedFixturesRemaining: [...created],
            preserveAllArtifacts: true, automaticRetry: false }), { flag: 'wx', mode: 0o600 })
        throw error
    } finally {
        try { if (controlLocked) await db.query('SELECT RELEASE_LOCK(?)', [lockName]) }
        finally {
            source?.destroy(); db?.destroy()
            if (cnfCreated) storage.unlinkSync(cnf)
        }
    }
}

let stage = 'configuration'
async function main() {
    const directory = fs.realpathSync(process.argv[3])
    const expected = path.resolve(process.env.LOCALAPPDATA || '', 'EvaluationDev/inova-nucleo-compat-20261029')
    ensure(directory.toLowerCase() === expected.toLowerCase(), 'E2B_DIRECTORY_REFUSED')
    const profile = JSON.parse(fs.readFileSync(path.join(directory, 'profile.json'), 'utf8').replace(/^\uFEFF/, ''))
    const config = staticConnection(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8'))
    ensure(/^[a-f0-9]{64}$/.test(process.env.EVAL_LOCAL_COPY_BACKUP_KEY || ''), 'E2B_KEYS_REQUIRED')
    const backupKey = Buffer.from(process.env.EVAL_LOCAL_COPY_BACKUP_KEY, 'hex')
    try {
        console.log(JSON.stringify(await run({ action: process.argv[2], profile, config, directory, backupKey,
            secret: process.env.EVAL_LOCAL_COPY_INVENTORY_SECRET, confirmation: process.env.EVAL_LOCAL_ACCESS_CONFIRMATION,
            progress(value) { stage = value; console.log(JSON.stringify({ stage: value })) } })))
    } finally { backupKey.fill(0) }
}
if (require.main === module) main().catch(error => {
    const line = error.stack?.match(/local-mysql-access\.js:(\d+):\d+/)?.[1]
    console.error(JSON.stringify({ success: false, stage, code: /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'E2B_ACCESS_FAILED',
        ...(line ? { location: Number(line) } : {}), privateDiagnosticsSuppressed: true }))
    process.exitCode = 1
})
module.exports = { run, E2B_CONFIRMATION, scope, checkAccounts, checkServer, checkLedger, assertControl, lockedSnapshot, activateAccounts, dropOwnedFixture, artifacts }
