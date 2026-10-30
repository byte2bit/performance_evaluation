// Opt-in integration runner. Never imports index.js, knexfile.js or application .env.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { randomBytes, createHmac } = require('node:crypto')
const assert = require('node:assert/strict')
const mysql = require('mysql2/promise')
const knex = require('knex')

let phase = 'profile'
const pools = new Set()
const servers = new Set()

function loadProfile(env = process.env) {
    const file = env.EVAL_ISOLATED_PROFILE
    assert.ok(file && path.isAbsolute(file), 'Explicit external profile required')
    const directory = fs.realpathSync(path.dirname(file))
    const workspace = path.resolve(__dirname, '../..')
    assert.equal(directory.toLowerCase() === workspace.toLowerCase() ||
        directory.toLowerCase().startsWith(workspace.toLowerCase() + path.sep), false)
    const profile = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    assert.equal(profile.kind, 'evaluation-isolated-mysql-v1')
    assert.match(profile.id, /^[a-f0-9]{32}$/)
    assert.equal(profile.host, '127.0.0.1')
    assert.ok(Number.isInteger(profile.port) && profile.port > 1024 && profile.port <= 65535 && profile.port !== 3306)
    const generation = profile.generation || 1
    assert.ok(Number.isInteger(generation) && generation >= 1 && generation <= 20)
    assert.equal(profile.database, 'evaluation_isolated_' + profile.id.slice(0, 12) + (generation === 1 ? '' : '_v' + generation))
    assert.equal(path.resolve(profile.dataDirectory).toLowerCase(), path.join(directory, 'data').toLowerCase())
    assert.match(profile.serverUuid, /^[a-f0-9-]{36}$/)
    for (const name of ['ROOT', 'MIGRATION', 'APP', 'ADMIN', 'EVALUATOR']) {
        assert.match(env[`EVAL_ISOLATED_${name}_PASSWORD`] || '', /^[a-f0-9]{64}$/)
    }
    return { ...profile, directory }
}

function connection(profile, role, database) {
    return { host: profile.host, port: profile.port,
        user: role === 'root' ? 'root' : role === 'migrator' ? 'evaluation_migrator' : 'evaluation_app',
        password: process.env[role === 'root' ? 'EVAL_ISOLATED_ROOT_PASSWORD' : role === 'migrator' ? 'EVAL_ISOLATED_MIGRATION_PASSWORD' : 'EVAL_ISOLATED_APP_PASSWORD'],
        ...(database ? { database } : {}), timezone: 'Z', charset: 'utf8mb4', connectTimeout: 1500 }
}

async function verifyServer(client, profile) {
    const [rows] = await client.query('SELECT @@datadir AS directory, @@port AS port, @@server_uuid AS uuid, @@bind_address AS bindAddress, VERSION() AS version')
    const row = rows[0]
    assert.equal(path.resolve(row.directory).toLowerCase(), path.resolve(profile.dataDirectory).toLowerCase())
    assert.equal(Number(row.port), profile.port)
    assert.equal(row.uuid, profile.serverUuid)
    assert.equal(row.bindAddress, '127.0.0.1')
    return row.version
}

async function rootConnection(profile, retry = false) {
    for (let attempt = 0; ; attempt++) {
        let client
        try {
            client = await mysql.createConnection(connection(profile, 'root'))
            await verifyServer(client, profile)
            return client
        } catch (error) {
            if (client) await client.end().catch(() => {})
            if (!retry || attempt >= 29) throw error
            await new Promise(resolve => setTimeout(resolve, 500))
        }
    }
}

function database(profile, role, name) {
    assert.ok(name === profile.database || name.startsWith(profile.database + '_legacy_'))
    const db = knex({ client: 'mysql', connection: connection(profile, role, name), pool: { min: 0, max: 4 },
        debug: false, log: { warn() {}, error() {}, debug() {}, deprecate() {} } })
    pools.add(db)
    return db
}

async function ownedDatabase(root, profile, name, fresh = false) {
    assert.ok(name === profile.database || name.startsWith(profile.database + '_legacy_'))
    const [found] = await root.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [name])
    if (found.length) {
        assert.equal(fresh, false)
        const [marker] = await root.query('SELECT profile_id FROM ??.isolation_marker', [name])
        assert.equal(marker[0]?.profile_id, profile.id)
    } else {
        await root.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci', [name])
        await root.query('CREATE TABLE ??.isolation_marker (profile_id VARCHAR(32) NOT NULL PRIMARY KEY)', [name])
        await root.query('INSERT INTO ??.isolation_marker (profile_id) VALUES (?)', [name, profile.id])
    }
}

async function provisionDatabaseUsers(root, profile, legacyName) {
    for (const [user, secret] of [['evaluation_migrator', process.env.EVAL_ISOLATED_MIGRATION_PASSWORD],
        ['evaluation_app', process.env.EVAL_ISOLATED_APP_PASSWORD]]) {
        await root.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED WITH mysql_native_password BY ?', [user, '127.0.0.1', secret])
    }
    for (const name of [profile.database, legacyName]) {
        await root.query('GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON ??.* TO ?@?', [name, 'evaluation_migrator', '127.0.0.1'])
    }
    await root.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ??.* TO ?@?', [profile.database, 'evaluation_app', '127.0.0.1'])
}

function migrationSource(files, progress) {
    return {
        async getMigrations() { return files },
        getMigrationName(file) { return file },
        getMigration(file) {
            const original = require(path.join(__dirname, '../migrations', file))
            return { ...original, up(db) { progress.current = file; return original.up(db) } }
        }
    }
}

async function validateMigrations(profile, root, report) {
    const files = fs.readdirSync(path.join(__dirname, '../migrations')).filter(file => /^\d+_.*\.js$/.test(file)).sort()
    const legacyName = profile.database + '_legacy_' + randomBytes(3).toString('hex')
    await ownedDatabase(root, profile, profile.database)
    await ownedDatabase(root, profile, legacyName, true)
    await provisionDatabaseUsers(root, profile, legacyName)
    const progress = {}
    const legacy = database(profile, 'migrator', legacyName)
    try {
        const originalFiles = files.filter(file => !file.includes('add_colab_name_index') && !file.includes('add_liderancas_to_registros'))
        await legacy.migrate.latest({ migrationSource: migrationSource(originalFiles, progress), tableName: 'migrations' })
        report.historicalSchema = { success: true, database: legacyName }
    } catch (error) {
        assert.equal(error.code, 'ER_FK_NO_INDEX_PARENT')
        assert.equal(progress.current, '20240622215930_create_table_registros.js')
        report.historicalSchema = { success: false, database: legacyName, migration: progress.current,
            code: error.code || 'SCHEMA_MIGRATION_FAILED', errno: error.errno }
    } finally { await legacy.destroy(); pools.delete(legacy) }

    const migrate = database(profile, 'migrator', profile.database)
    await migrate.migrate.latest({ migrationSource: migrationSource(files, {}), tableName: 'migrations' })
    const [columns] = await migrate.raw('SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?)',
        [profile.database, 'users2', 'sessions', 'auth_rate_limits'])
    assert.ok(columns.some(column => column.TABLE_NAME === 'sessions' && column.COLUMN_NAME === 'sess' && column.DATA_TYPE === 'json'))
    assert.ok(columns.some(column => column.TABLE_NAME === 'users2' && column.COLUMN_NAME === 'session_version'))
    const leaderColumn = await migrate.schema.hasColumn('registros', 'liderancas')
    assert.equal(leaderColumn, true)
    report.authenticationMigrations = { success: true, persistedColumns: columns.length }
    report.completeMigrationChain = { success: true, migrationCount: files.length, businessSchemaAdaptedByFixture: false }
    await migrate.destroy(); pools.delete(migrate)
}

async function startApplication(profile, port = 0) {
    const db = database(profile, 'application', profile.database)
    const app = require('express')()
    app.db = db
    require('nodemailer').createTransport = () => { throw new Error('SMTP_FORBIDDEN_IN_ISOLATION') }
    require('consign')({ cwd: path.resolve(__dirname, '..'), verbose: false })
        .include('./config/passport.js').then('./config/middlewares.js').then('./api/validation.js')
        .then('./api').then('./config/routes.js').into(app)
    const server = http.createServer(app)
    servers.add(server)
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
    return { app, db, server,
        async close() {
            await new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
            servers.delete(server); await db.destroy(); pools.delete(db)
        }
    }
}

function browser(runtime) {
    let cookie = ''
    return {
        get cookie() { return cookie }, set cookie(value) { cookie = value },
        request(method, url, data, token) {
            return new Promise((resolve, reject) => {
                const body = data === undefined ? '' : JSON.stringify(data)
                const req = http.request({ host: '127.0.0.1', port: runtime.server.address().port, path: url, method,
                    headers: { Origin: process.env.FRONTEND_ORIGIN, Cookie: cookie, 'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body), ...(token ? { 'X-CSRF-Token': token } : {}) } }, res => {
                    if (res.headers['set-cookie']?.[0]) cookie = res.headers['set-cookie'][0].split(';')[0]
                    const chunks = []
                    res.on('data', chunk => chunks.push(chunk))
                    res.on('end', () => { const text = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, text, json: () => JSON.parse(text) }) })
                })
                req.setTimeout(5000, () => req.destroy(new Error('ISOLATED_HTTP_TIMEOUT')))
                req.on('error', reject); req.end(body)
            })
        },
        async csrf() {
            const response = await this.request('GET', '/csrf-token')
            assert.equal(response.status, 200)
            return response.json().csrfToken
        },
        async login(email, password) { return this.request('POST', '/signin', { email, password }, await this.csrf()) }
    }
}

async function fixtures(db, profile) {
    const accounts = require('../lib/auth/accounts').createAccounts(db)
    for (const [email, name, admin, variable] of [
        ['admin@example.invalid', 'Administrador fictício', true, 'EVAL_ISOLATED_ADMIN_PASSWORD'],
        ['reviewer@example.invalid', 'Avaliador fictício', false, 'EVAL_ISOLATED_EVALUATOR_PASSWORD']
    ]) {
        const existing = await db('users2').where({ email }).first()
        if (!existing) await accounts.create({ name, email, password: process.env[variable], admin })
        else await accounts.change(existing.id, 'activate', process.env[variable])
    }
    for (const [name, email] of [['Profissional fictício A', 'reviewer@example.invalid'], ['Profissional fictício B', 'other@example.invalid']]) {
        if (!await db('colab').where({ colab: name }).first()) await db('colab').insert({ colab: name, demandante: email })
    }
    return accounts
}

function sessionId(cookie) {
    const match = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)).match(/^s:([^.]+)\./)
    assert.ok(match, 'Expected a signed isolated session cookie')
    return match[1]
}

async function validateSessionExpiry(runtime, password, fixtureKeys) {
    await runtime.db('auth_rate_limits').whereIn('key', fixtureKeys).update({ expire: 0 })
    for (const mode of ['database', 'idle', 'absolute']) {
        phase = 'sql-session-expiry-' + mode
        const client = browser(runtime)
        assert.equal((await client.login('reviewer@example.invalid', password)).status, 200)
        const sid = sessionId(client.cookie)
        if (mode === 'database') {
            const changed = await runtime.db('sessions').where({ sid }).update({ expired: runtime.db.raw('UTC_TIMESTAMP() - INTERVAL 1 MINUTE') })
            assert.equal(changed, 1)
            const [proof] = await runtime.db.raw('SELECT expired < UTC_TIMESTAMP() AS expired FROM sessions WHERE sid = ?', [sid])
            assert.equal(Number(proof[0].expired), 1)
        } else {
            const row = await runtime.db('sessions').where({ sid }).first()
            const session = typeof row.sess === 'string' ? JSON.parse(row.sess) : row.sess
            if (mode === 'idle') session.lastActivityAt = Date.now() - 31 * 60 * 1000
            else { session.authStartedAt = Date.now() - 8 * 60 * 60 * 1000 - 1000; session.lastActivityAt = Date.now() }
            await runtime.db('sessions').where({ sid }).update({ sess: JSON.stringify(session) })
        }
        assert.equal((await client.request('GET', '/session')).status, 401)
    }
}

async function validateApiInputs(runtime, client, token, record, report) {
    const counts = async () => {
        const [records] = await runtime.db('registros').count('* as count')
        const [people] = await runtime.db('colab').count('* as count')
        return { records: Number(records.count), people: Number(people.count) }
    }
    const before = await counts()
    for (const endpoint of ['/registros', '/registros2']) {
        for (const body of [{ colab: record.colab }, { ...record, nota_respon: 4.25 },
            { ...record, avaliacao: '1' }, { ...record, itensQualidade: [] },
            { ...record, obs_prazo: '😀'.repeat(256) }]) {
            assert.equal((await client.request('POST', endpoint, body, token)).status, 400)
        }
    }
    for (const query of ['page=0', 'page=2x', 'page=1&page=2', 'limit=101', 'page[x]=1',
        'page=9007199254740991&limit=100']) {
        assert.equal((await client.request('GET', '/registros2?' + query)).status, 400)
    }
    const bounded = await client.request('GET', '/registros2?page=1&limit=1')
    assert.equal(bounded.status, 200)
    assert.ok(bounded.json().length <= 1)
    assert.ok(bounded.json().every(row => row.demandante === 'reviewer@example.invalid'))

    const admin = browser(runtime)
    assert.equal((await admin.login('admin@example.invalid', process.env.EVAL_ISOLATED_ADMIN_PASSWORD)).status, 200)
    const adminToken = await admin.csrf()
    assert.equal((await admin.request('POST', '/colab', { colab: 'Fictício inválido', demandante: 'admin@example.invalid', matricula: [] }, adminToken)).status, 400)
    for (const resource of ['/colab/', '/registros/']) for (const id of ['0', '1x', '4294967296']) {
        assert.equal((await admin.request('GET', resource + id)).status, 400)
        assert.equal((await admin.request('DELETE', resource + id, {}, adminToken)).status, 400)
    }
    assert.equal((await admin.request('POST', '/signout', {}, adminToken)).status, 204)
    assert.deepEqual(await counts(), before)

    // Exercise utf8mb4 VARCHAR(255) and low-rating criteria without persisting the probe.
    const payload = require('../lib/business-validation').evaluation({ ...record,
        nota_qualidade: '3', nota_prazo: '3', nota_dispon: '3', nota_respon: '3',
        avaliacao: '3', nivel: 'D', desconto: '3%', obs_qualidade: '😀'.repeat(255),
        itensQualidade: 'Critério fictício', itensDispon: 'Critério fictício' })
    assert.ok(payload)
    const trx = await runtime.db.transaction()
    try {
        const [id] = await trx('registros').insert({ ...payload, demandante: 'reviewer@example.invalid' })
        const saved = await trx('registros').where({ id }).first()
        assert.equal(saved.obs_qualidade, payload.obs_qualidade)
        assert.equal(saved.avaliacao, '3')
        assert.equal(saved.desconto, '3%')
    } finally { await trx.rollback() }
    assert.deepEqual(await counts(), before)
    report.apiInputValidation = { invalidPayloadsReturn400: true, invalidRouteIdsReturn400: true,
        noBusinessRowsChangedByInvalidInputs: true, paginationBounded: true, unicode255RoundTrip: true, unicodeProbeRolledBack: true }
}

async function validateAuthentication(profile, report) {
    let runtime = await startApplication(profile)
    await fixtures(runtime.db, profile)
    const fixtureUser = await runtime.db('users2').where({ email: 'reviewer@example.invalid' }).first()
    const digest = value => createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET).update(JSON.stringify(value)).digest('hex')
    const fixtureKeys = ['csrf-ip', 'signin-ip', 'mail-ip', 'password-ip'].map(prefix => prefix + ':' + digest('127.0.0.1'))
    fixtureKeys.push('signin-pair:' + digest(['127.0.0.1', 'admin@example.invalid']),
        'signin-pair:' + digest(['127.0.0.1', 'reviewer@example.invalid']),
        'mail-user:' + digest(fixtureUser.id), 'password-user:' + digest(fixtureUser.id))
    // Expire only counters belonging to this profile's synthetic validation flow.
    await runtime.db('auth_rate_limits').whereIn('key', fixtureKeys).update({ expire: 0 })
    const client = browser(runtime)
    const password = process.env.EVAL_ISOLATED_EVALUATOR_PASSWORD
    assert.equal((await client.request('GET', '/registros')).status, 401)
    phase = 'sql-login'
    assert.equal((await client.login('reviewer@example.invalid', password)).status, 200)
    const token = await client.csrf()
    assert.equal((await client.request('GET', '/session')).json().admin, false)
    const professionals = await client.request('GET', '/colab')
    assert.equal(professionals.status, 200)
    assert.deepEqual(professionals.json().map(row => row.colab), ['Profissional fictício A'])
    assert.equal((await client.request('DELETE', '/colab/1', {}, token)).status, 403)
    assert.equal((await client.request('POST', '/mail', {}, token)).status, 403)
    assert.equal((await client.request('POST', '/registros', {}, 'invalid')).status, 403)

    phase = 'sql-record-transaction'
    const record = { colab: 'Profissional fictício A', demandante: 'other@example.invalid', avaliacao: '5', nivel: 'A', desconto: '0%',
        nota_qualidade: '5', obs_qualidade: '', nota_prazo: '5', obs_prazo: '', nota_dispon: '5', obs_dispon: '',
        nota_respon: '5', obs_respon: '', itensQualidade: '', itensDispon: '', liderancas: 'Equipe fictícia' }
    assert.equal((await client.request('POST', '/registros', record, token)).status, 204)
    assert.equal((await client.request('POST', '/registros2', { ...record, colab: 'Profissional fictício B' }, token)).status, 403)
    const records = await client.request('GET', '/registros')
    assert.equal(records.status, 200)
    assert.ok(records.json().every(row => row.demandante === 'reviewer@example.invalid'))
    report.sqlAuthorizationAndTransactions = true

    phase = 'sql-input-validation'
    await validateApiInputs(runtime, client, token, record, report)

    phase = 'persistent-session-restart'
    const savedCookie = client.cookie
    const [{ count }] = await runtime.db('sessions').count('* as count')
    assert.ok(Number(count) > 0)
    await runtime.close()
    runtime = await startApplication(profile)
    const restored = browser(runtime); restored.cookie = savedCookie
    assert.equal((await restored.request('GET', '/session')).status, 200)
    report.sessionSurvivesApplicationRestart = true

    phase = 'sql-shared-rate-limit'
    const secondDb = database(profile, 'application', profile.database)
    const { createLimits } = require('../lib/auth/limits')
    const { readConfig } = require('../lib/auth/config')
    const gates = [createLimits(runtime.db, readConfig()), createLimits(secondDb, readConfig())]
    const user = await runtime.db('users2').where({ email: 'reviewer@example.invalid' }).first()
    const outcomes = await Promise.all(Array.from({ length: 15 }, async (_, index) => {
        let outcome = 200
        const res = { set() {}, status(value) { outcome = value; return this }, send() {} }
        await gates[index % 2]('mail')({ ip: '127.0.0.1', user }, res, () => {})
        return outcome
    }))
    assert.equal(outcomes.filter(value => value === 200).length, 10)
    assert.equal(outcomes.filter(value => value === 429).length, 5)
    report.sharedConcurrentRateLimit = { allowed: 10, blocked: 5, runtimes: 2 }
    await secondDb.destroy(); pools.delete(secondDb)

    phase = 'sql-password-revocation'
    const secretHeaders = await restored.csrf()
    assert.equal((await restored.request('POST', '/change-password', { currentPassword: password, newPassword: password + '-probe' }, secretHeaders)).status, 204)
    const replay = browser(runtime); replay.cookie = savedCookie
    assert.equal((await replay.request('GET', '/session')).status, 401)
    const changed = browser(runtime)
    assert.equal((await changed.login('reviewer@example.invalid', password + '-probe')).status, 200)
    await require('../lib/auth/accounts').createAccounts(runtime.db).change(user.id, 'disable')
    assert.equal((await changed.request('GET', '/session')).status, 401)
    const currentAccounts = require('../lib/auth/accounts').createAccounts(runtime.db)
    await currentAccounts.change(user.id, 'activate', password)
    const last = browser(runtime)
    assert.equal((await last.login('reviewer@example.invalid', password)).status, 200)
    const logoutToken = await last.csrf()
    assert.equal((await last.request('POST', '/signout', {}, logoutToken)).status, 204)
    report.passwordChangeLogoutAndRevocation = true

    phase = 'sql-session-expiry'
    await validateSessionExpiry(runtime, password, fixtureKeys)
    report.sessionExpiry = { databaseTTL: true, inactivity: true, absoluteDuration: true }

    phase = 'sql-admin-login'
    const admin = browser(runtime)
    assert.equal((await admin.login('admin@example.invalid', process.env.EVAL_ISOLATED_ADMIN_PASSWORD)).status, 200)
    assert.equal((await admin.request('GET', '/session')).json().admin, true)
    assert.equal((await admin.request('GET', '/colab')).json().length, 2)
    assert.equal((await admin.request('POST', '/signout', {}, await admin.csrf())).status, 204)
    report.adminLoginAndVisibility = true

    phase = 'sql-permissions'
    let denied = false
    try { await runtime.db.schema.createTable('forbidden_ddl_probe', table => table.integer('id')) }
    catch (error) { denied = error.code === 'ER_TABLEACCESS_DENIED_ERROR' || error.errno === 1142 }
    assert.equal(denied, true)
    report.applicationAccountCannotCreateTables = true
    report.fictionalAccounts = ['admin@example.invalid', 'reviewer@example.invalid']
    report.externalSecretsConfigured = true
    await runtime.close()
}

async function main() {
    const profile = loadProfile()
    const action = process.argv[2]
    assert.ok(['ready', 'validate', 'validatelinks', 'inventory', 'reconcilereviewed', 'validatemanagement', 'activatemanagement', 'enforceprofessionaldepartment', 'servemanagementcopy', 'validatemonthlyrecords', 'recoverytest', 'visualreview', 'stop', 'serve'].includes(action))
    if (['validate', 'visualreview'].includes(action)) {
        // These historical fixtures predate department IDs. Never let their
        // generic migration path activate the new model on the source schema.
        throw Object.assign(new Error('Use the copy-only management validation workflow.'), { code: 'LEGACY_RUNNER_REQUIRES_MANAGEMENT_REVIEW' })
    }
    if (action === 'inventory') {
        phase = 'read-only-inventory'
        const client = await mysql.createConnection(connection(profile, 'application', profile.database))
        try {
            const expectedMigrations = fs.readdirSync(path.join(__dirname, '../migrations')).filter(file => /^\d+_.*\.js$/.test(file) && file <= '20261026000100_link_registros_to_colab_id.js').sort()
            const report = await require('./isolated-inventory').inventory({ profile, client, verifyServer,
                expectedMigrations, secret: process.env.SESSION_SECRET })
            console.log(JSON.stringify(report))
        } catch {
            // SQL, assertion diffs and private row contents must never reach the console.
            throw Object.assign(new Error('Read-only inventory failed'), { code: 'INVENTORY_FAILED' })
        } finally { await client.end() }
        return
    }
    phase = 'server-identity'
    const root = await rootConnection(profile, action === 'ready')
    try {
        const version = await verifyServer(root, profile)
        if (action === 'ready') { console.log(JSON.stringify({ ready: true, version })); return }
        if (action === 'validatemonthlyrecords') {
            phase = 'monthly-records-preconditions'
            const report = await require('./isolated-monthly-records').validate({ profile, root, verifyServer, startApplication, browser,
                confirmation: process.env.EVAL_MONTHLY_CONFIRMATION, copyId: process.env.EVAL_MONTHLY_COPY_ID,
                progress(stage) { phase = 'monthly-records-' + stage; console.log(JSON.stringify({ phase })) } })
            console.log(JSON.stringify(report))
            return
        }
        if (action === 'stop') { await root.query('SHUTDOWN'); console.log(JSON.stringify({ stopped: true })); return }
        if (action === 'enforceprofessionaldepartment') {
            phase = 'required-department-preconditions'
            const report = await require('./isolated-required-department').enforce({ profile, root, verifyServer, database, startApplication, browser,
                confirmation: process.env.EVAL_REQUIRED_DEPARTMENT_CONFIRMATION, secret: process.env.SESSION_SECRET,
                recoveryKey: process.env.EVAL_ISOLATED_RECOVERY_KEY,
                progress(stage) { phase = 'required-department-' + stage; console.log(JSON.stringify({ phase })) } })
            console.log(JSON.stringify(report))
            return
        }
        if (action === 'activatemanagement') {
            phase = 'management-activation-preconditions'
            const report = await require('./isolated-activate-management').activate({ profile, root, verifyServer, database, startApplication, browser,
                connectApplication: selected => mysql.createConnection(connection(selected, 'application', selected.database)),
                approvedMapName: process.env.EVAL_DEPARTMENT_APPROVED_MAP,
                confirmation: process.env.EVAL_DEPARTMENT_CONFIRMATION,
                recoveryReportName: process.env.EVAL_DEPARTMENT_RECOVERY_REPORT,
                secret: process.env.SESSION_SECRET, recoveryKey: process.env.EVAL_ISOLATED_RECOVERY_KEY,
                progress(stage) { phase = 'activate-management-' + stage; console.log(JSON.stringify({ phase })) } })
            console.log(JSON.stringify(report))
            return
        }
        if (action === 'servemanagementcopy') {
            phase = 'management-copy-preview'
            const filename = process.env.EVAL_MANAGEMENT_REPORT
            assert.match(filename || '', /^management-report-[a-f0-9]{12}\.json$/)
            const report = JSON.parse(fs.readFileSync(path.join(profile.directory, filename), 'utf8'))
            const target = require('./isolated-management').previewTarget(profile, report, filename)
            const [[marker]] = await root.query('SELECT profile_id FROM ??.isolation_marker', [target]); assert.equal(marker.profile_id, profile.id)
            const [migrations] = await root.query('SELECT name FROM ??.migrations ORDER BY name', [target])
            assert.equal(migrations.length, 13); assert.equal(migrations.at(-1).name, '20261027000100_add_management_departments.js')
            const runtime = await startApplication({ ...profile, database: target }, 8002)
            console.log(JSON.stringify({ servingManagementCopy: true, url: 'http://127.0.0.1:8002', frontend: 'http://127.0.0.1:5174' }))
            process.once('SIGINT', async () => { await runtime.close(); process.exit(0) })
            return
        }
        if (action === 'validatemanagement') {
            try {
                const report = await require('./isolated-management').validate({ profile, root, verifyServer, database, startApplication, browser,
                    progress(stage) { phase = 'management-' + stage; console.log(JSON.stringify({ phase })) } })
                console.log(JSON.stringify(report))
            } catch (error) {
                const line = error.stack?.match(/isolated-management\.js:(\d+):/)?.[1] || 'UNKNOWN'
                throw Object.assign(new Error('Management copy validation failed'), { code: 'MANAGEMENT_COPY_FAILED_AT_' + line })
            }
            return
        }
        if (action === 'reconcilereviewed') {
            phase = 'reviewed-reconciliation'
            const report = await require('./isolated-reconcile').reconcile({ profile, root, verifyServer,
                connectApplication: selected => mysql.createConnection(connection(selected, 'application', selected.database)),
                startApplication, browser, secret: process.env.SESSION_SECRET,
                reviewReportName: process.env.EVAL_RECONCILE_REVIEW_REPORT,
                recoveryReportName: process.env.EVAL_RECONCILE_RECOVERY_REPORT,
                confirmedMap: process.env.EVAL_RECONCILE_CONFIRMED_MAP,
                progress(stage) { phase = 'reconcile-' + stage; console.log(JSON.stringify({ phase })) }
            })
            console.log(JSON.stringify(report))
            return
        }
        if (action === 'validatelinks') {
            const report = await require('./isolated-record-links').apply({
                profile, root, verifyServer, database, startApplication, browser, validateAuthentication,
                progress(stage) { phase = 'links-' + stage; console.log(JSON.stringify({ phase })) }
            })
            fs.writeFileSync(path.join(profile.directory, 'links-validation-report-' + report.backupId + '.json'), JSON.stringify(report, null, 2))
            console.log(JSON.stringify(report))
            return
        }
        if (action === 'visualreview') {
            phase = 'isolated-visual-review'
            const [marker] = await root.query('SELECT profile_id FROM ??.isolation_marker', [profile.database])
            assert.equal(marker[0]?.profile_id, profile.id)
            const report = await require('./isolated-visual').review({ profile, startApplication })
            console.log(JSON.stringify(report))
            if (!report.executionCompleted) process.exitCode = 1
            return
        }
        if (action === 'recoverytest') {
            phase = 'isolated-backup-restore'
            const report = await require('./isolated-recovery').recover({ profile, root, startApplication, browser })
            console.log(JSON.stringify(report))
            return
        }
        if (action === 'serve') {
            try { await require('./isolated-required-department').assertStructure(root, profile.database, 14, profile.id) }
            catch { throw Object.assign(new Error('The required department schema is not ready.'), { code: 'SOURCE_REQUIRED_DEPARTMENT_TRANSITION_PENDING' }) }
            const runtime = await startApplication(profile, 8001)
            console.log(JSON.stringify({ serving: true, url: 'http://localhost:' + runtime.server.address().port }))
            process.once('SIGINT', async () => { await runtime.close(); process.exit(0) })
            return
        }
        const report = { profileId: profile.id, database: profile.database, mysqlVersion: version, isolatedServerVerified: true, loopbackOnly: true }
        phase = 'schema-validation'
        await validateMigrations(profile, root, report)
        fs.writeFileSync(path.join(profile.directory, 'validation-report.json'), JSON.stringify(report, null, 2))
        console.log(JSON.stringify({ historicalSchema: report.historicalSchema, completeMigrationChain: report.completeMigrationChain }))
        await root.end()
        phase = 'sql-authentication'
        await validateAuthentication(profile, report)
        report.completedUtc = new Date().toISOString()
        fs.writeFileSync(path.join(profile.directory, 'validation-report.json'), JSON.stringify(report, null, 2))
        console.log(JSON.stringify(report))
    } finally { await root.end().catch(() => {}) }
}

if (require.main === module) main().catch(error => {
    const checkLocation = error.stack?.match(/isolated-record-links\.js:(\d+):\d+/)?.[1]
    console.error(JSON.stringify({ success: false, phase, code: error.code || 'ISOLATED_VALIDATION_FAILED',
        ...(checkLocation ? { checkLocation: 'isolated-record-links.js:' + checkLocation, checkOperator: error.operator } : {}),
        ...(typeof error.expected === 'number' && typeof error.actual === 'number' ? { expectedStatus: error.expected, actualStatus: error.actual } : {}) }))
    process.exitCode = 1
}).finally(async () => {
    if (['serve', 'servemanagementcopy'].includes(process.argv[2]) && !process.exitCode) return
    for (const server of servers) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
    for (const db of pools) await db.destroy().catch(() => {})
})

module.exports = { loadProfile, verifyServer, ownedDatabase }
