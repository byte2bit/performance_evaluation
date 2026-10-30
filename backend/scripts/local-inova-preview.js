// Local E3 copy only. No app .env execution, migration, grant or SMTP. The
// default production/development bootstrap remains Argon2-only and unchanged.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const assert = require('node:assert/strict')
const knexFactory = require('knex')
const { SOURCE, TARGET, CONFIRMATION, assertScope, staticConnection, grantPrivileges } = require('./local-mysql-copy')
const { catalog, LEDGER } = require('./local-mysql-compat')
const { connect, loadPrivate, privateIdentity, migrationNames, assertPreviewPortsFree, validateScopes } = require('./local-inova-maps')
const { ensure } = require('./local-access-guard')
const { readConfig } = require('../lib/auth/config')
const { createAuth } = require('../lib/auth')
const { createCredentials } = require('../lib/auth/credentials')
const { createPasswords } = require('../lib/auth/passwords')
const { createLegacyBcrypt } = require('../lib/auth/legacy-bcrypt')
const { createStore } = require('../lib/auth/session-store')
const { active, isAdmin } = require('../lib/auth/identity')
const { isLegacyHash } = require('../lib/auth/legacy-bcrypt-format')

const apiOrigin = 'http://localhost:8002', frontendOrigin = 'http://localhost:5174'
const cookieName = 'evaluation.inova.local.sid'
function validPersistedHash(value) {
    if (isLegacyHash(value)) return true
    if (typeof value !== 'string' || value.length > 255) return false
    const fields = value.split('$')
    if (fields.length !== 6 || fields[0] !== '' || fields[1] !== 'argon2id' || fields[2] !== 'v=19' ||
        !/^[A-Za-z0-9+/]{22}$/.test(fields[4]) || !/^[A-Za-z0-9+/]{43}$/.test(fields[5])) return false
    const options = fields[3].split(',').map(item => item.match(/^([mtp])=(\d+)$/))
    if (options.length !== 3 || options.some(item => !item) || new Set(options.map(item => item[1])).size !== 3) return false
    const costs = Object.fromEntries(options.map(item => [item[1], Number(item[2])]))
    return costs.m === 19456 && costs.t === 2 && costs.p === 1
}

function previewConfig(secrets) {
    ensure(/^[a-f0-9]{64}$/.test(secrets.session || '') && /^[a-f0-9]{64}$/.test(secrets.rate || '') && secrets.session !== secrets.rate, 'PREVIEW_SECRETS_REFUSED')
    return { ...readConfig({ SESSION_SECRET: secrets.session, AUTH_RATE_LIMIT_SECRET: secrets.rate, FRONTEND_ORIGIN: frontendOrigin }), cookieName }
}

function childEnvironment(env, nonce, frontendOnly = false) {
    ensure(/^[a-f0-9]{32}$/.test(nonce), 'PREVIEW_NONCE_REFUSED')
    const allowed = ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'EVAL_LOCAL_COPY_INVENTORY_SECRET', 'EVAL_INOVA_SESSION', 'EVAL_INOVA_RATE']
    const result = Object.fromEntries(allowed.filter(key => typeof env[key] === 'string').map(key => [key, env[key]]))
    if (frontendOnly) for (const key of ['EVAL_LOCAL_COPY_INVENTORY_SECRET', 'EVAL_INOVA_SESSION', 'EVAL_INOVA_RATE']) delete result[key]
    return { ...result, NODE_ENV: 'development', VITE_API_URL: apiOrigin, EVAL_INOVA_PREVIEW_NONCE: nonce }
}

async function verifyPublished(directory, profile, config, secret) {
    assertScope(profile, CONFIRMATION)
    ensure(config.host === '127.0.0.1' && config.port === 3306 && config.database === SOURCE && /^[a-f0-9]{64}$/.test(secret || ''), 'PREVIEW_SCOPE_REFUSED')
    ensure(!fs.existsSync(path.join(directory, 'maps-e3-failure.json')), 'PREVIEW_INCOMPLETE_MAPS')
    const identity = privateIdentity(profile)
    const applied = loadPrivate(directory, profile, secret, 'maps-e3-applied.evalinventory', identity + ':e3:maps-e3-applied.evalinventory')
    ensure(applied.profileId === profile.id && applied.target === TARGET && applied.serverUuid === profile.serverUuid && applied.canServePreview === true, 'PREVIEW_MAPS_NOT_VERIFIED')
    const db = await connect(config)
    try {
        const [[server]] = await db.query('SELECT DATABASE() AS name,@@port AS port,@@server_uuid AS uuid,VERSION() AS version,@@foreign_key_checks AS fk')
        ensure(server.name === TARGET && Number(server.port) === 3306 && server.uuid === profile.serverUuid && server.version === '8.0.44' && Number(server.fk) === 1, 'PREVIEW_SERVER_CHANGED')
        assert.deepEqual(await catalog(db), applied.afterCatalog)
        const [ledger] = await db.query('SELECT * FROM ??.?? ORDER BY id', [TARGET, LEDGER]); assert.deepEqual(ledger, applied.ledgerAfter)
        assert.deepEqual(ledger.map(row => row.name), migrationNames)
        const [grants] = await db.query('SHOW GRANTS'), allows = grantPrivileges(grants, TARGET)
        ensure(['SELECT', 'INSERT', 'UPDATE', 'DELETE'].every(name => allows(name)), 'PREVIEW_PRIVILEGES_MISSING')
        const [[orphans]] = await db.query('SELECT COUNT(*) AS n FROM ??.colab c LEFT JOIN ??.gerencias g ON g.id=c.gerencia_id LEFT JOIN ??.users2 u ON u.id=g.demandante_id WHERE c.gerencia_id IS NULL OR g.id IS NULL OR u.id IS NULL', [TARGET, TARGET, TARGET])
        ensure(Number(orphans.n) === 0, 'PREVIEW_BROKEN_DEPARTMENT_LINK')
        const [accounts] = await db.query('SELECT id,password,active,admin,deletedAt,session_version FROM ??.users2', [TARGET])
        ensure(accounts.some(row => active(row) && isAdmin(row)) && accounts.every(row => validPersistedHash(row.password) && Number.isSafeInteger(row.session_version) && row.session_version >= 0 && row.session_version <= 4294967295), 'PREVIEW_ACCOUNT_INVARIANT_FAILED')
        return { success: true, target: TARGET, schemaVerified: true, compatibilityMigrations: 3,
            legacyAccounts: accounts.filter(row => isLegacyHash(row.password)).length, argon2Accounts: accounts.filter(row => !isLegacyHash(row.password)).length,
            activeAccounts: accounts.filter(active).length, api: apiOrigin, frontend: frontendOrigin, cookieName, smtpBlocked: true }
    } finally { db.destroy() }
}

function composeApp({ db, secrets, legacy, passwords = createPasswords(), store, limit, nonce }) {
    ensure(typeof legacy?.verify === 'function' && /^[a-f0-9]{32}$/.test(nonce), 'PREVIEW_COMPOSITION_REFUSED')
    const config = previewConfig(secrets)
    store ||= createStore(db)
    // This process is dedicated to the local preview; never restore SMTP while
    // it is serving, even if credentials were accidentally configured elsewhere.
    require('nodemailer').createTransport = () => { throw Object.assign(new Error('SMTP blocked in local preview'), { code: 'SMTP_FORBIDDEN_LOCAL_PREVIEW' }) }
    const app = require('express')()
    const auth = createAuth({ db, config, passwords, store, limit, credentials: createCredentials({ db, passwords, legacy }) })
    app.db = db; app.config = { passport: auth }
    app.get('/__inova_preview', (req, res) => res.json({ preview: 'inova-local-e3', nonce, pid: process.pid }))
    require('consign')({ cwd: path.resolve(__dirname, '..'), verbose: false })
        .include('./config/middlewares.js').then('./api/validation.js').then('./api').then('./config/routes.js').into(app)
    return { app, auth, ready: store.ready }
}

async function responseJson(port, nonce) {
    return new Promise(resolve => {
        const request = http.get({ hostname: '127.0.0.1', port, path: '/__inova_preview' }, response => {
            const chunks = []; let size = 0
            response.on('data', chunk => { size += chunk.length; if (size < 4096) chunks.push(chunk); else request.destroy() })
            response.on('end', () => { try { const value = JSON.parse(Buffer.concat(chunks)); resolve(response.statusCode === 200 && value.nonce === nonce ? value : null) } catch { resolve(null) } })
        })
        request.setTimeout(800, () => request.destroy()); request.on('error', () => resolve(null))
    })
}

async function waitReady(port, nonce) {
    const end = Date.now() + 20000
    while (Date.now() < end) { const result = await responseJson(port, nonce); if (result) return result; await new Promise(resolve => setTimeout(resolve, 100)) }
    throw Object.assign(new Error('Preview startup failed'), { code: 'PREVIEW_START_TIMEOUT' })
}

async function start(directory, profile, config, secret) {
    const checked = await verifyPublished(directory, profile, config, secret)
    const file = path.join(directory, 'inova-preview-runtime.json')
    if (fs.existsSync(file)) {
        const previous = JSON.parse(fs.readFileSync(file, 'utf8'))
        ensure(previous.profileId === profile.id && previous.target === TARGET, 'PREVIEW_RUNTIME_IDENTITY_CHANGED')
        const [api, frontend] = await Promise.all([responseJson(8002, previous.nonce), responseJson(5174, previous.nonce)])
        if (api?.pid === previous.apiPid && frontend?.pid === previous.frontendPid) return { ...checked, alreadyRunning: true, apiPid: api.pid, frontendPid: frontend.pid }
    }
    await assertPreviewPortsFree()
    previewConfig({ session: process.env.EVAL_INOVA_SESSION, rate: process.env.EVAL_INOVA_RATE })
    const nonce = randomBytes(16).toString('hex'), children = []
    const launch = (script, args, name) => {
        const out = fs.openSync(path.join(directory, name + '.stdout.log'), 'a', 0o600), err = fs.openSync(path.join(directory, name + '.stderr.log'), 'a', 0o600)
        try {
            const child = spawn(process.execPath, [script, ...args], { env: childEnvironment(process.env, nonce, name === 'inova-preview-frontend'), stdio: ['ignore', out, err], windowsHide: true, detached: true })
            child.on('error', () => {}); children.push(child); child.unref(); return child
        } finally { fs.closeSync(out); fs.closeSync(err) }
    }
    try {
        const api = launch(__filename, ['serve', directory], 'inova-preview-api'); await waitReady(8002, nonce)
        const frontend = launch(path.resolve(__dirname, '../../frontend/scripts/serve-inova-preview.mjs'), [directory], 'inova-preview-frontend'); await waitReady(5174, nonce)
        const metadata = { profileId: profile.id, target: TARGET, nonce, apiPid: api.pid, frontendPid: frontend.pid,
            api: apiOrigin, frontend: frontendOrigin, startedUtc: new Date().toISOString() }
        fs.writeFileSync(file, JSON.stringify(metadata, null, 2), { mode: 0o600 })
        return { ...checked, started: true, apiPid: api.pid, frontendPid: frontend.pid }
    } catch (error) {
        // These are ChildProcess handles created by this invocation, never PIDs
        // found from a port or supplied by a browser/client.
        for (const child of children) if (child.exitCode === null) child.kill()
        throw error
    }
}

async function serve(directory, profile, config, secret) {
    const safeLog = code => fs.appendFileSync(path.join(directory, 'inova-preview-api.events.jsonl'), JSON.stringify({ code, utc: new Date().toISOString() }) + '\n')
    for (const method of ['log', 'warn', 'error', 'info', 'debug']) console[method] = () => safeLog('APPLICATION_LOG_SUPPRESSED')
    for (const key of Object.keys(process.env)) if (key.startsWith('SMTP_')) delete process.env[key]
    await verifyPublished(directory, profile, config, secret)
    const legacy = createLegacyBcrypt(), db = knexFactory({ client: 'mysql', connection: { ...config, database: TARGET, dateStrings: true, timezone: 'Z' },
        pool: { min: 0, max: 4 }, log: { warn() {}, error() {}, debug() {}, deprecate() {} } })
    let server, shuttingDown = false
    const close = async () => {
        if (shuttingDown) return; shuttingDown = true
        try { if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }) }
        finally { try { await legacy.close() } finally { await db.destroy() } }
    }
    const fail = () => { safeLog('PREVIEW_RUNTIME_FAILED'); close().finally(() => process.exit(1)) }
    process.once('uncaughtException', fail); process.once('unhandledRejection', fail)
    try {
        const composed = composeApp({ db, secrets: { session: process.env.EVAL_INOVA_SESSION, rate: process.env.EVAL_INOVA_RATE }, legacy, nonce: process.env.EVAL_INOVA_PREVIEW_NONCE })
        await composed.ready
        server = http.createServer(composed.app)
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8002, '127.0.0.1', resolve) })
        process.once('SIGINT', () => close().then(() => process.exit(0))); process.once('SIGTERM', () => close().then(() => process.exit(0)))
        safeLog('PREVIEW_READY')
    } catch (error) { await close(); throw error }
}

async function main() {
    const action = process.argv[2], directory = fs.realpathSync(process.argv[3])
    ensure(directory.toLowerCase() === path.resolve(process.env.LOCALAPPDATA || '', 'EvaluationDev/inova-nucleo-compat-20261029').toLowerCase(), 'PREVIEW_DIRECTORY_REFUSED')
    const profile = JSON.parse(fs.readFileSync(path.join(directory, 'profile.json'), 'utf8').replace(/^\uFEFF/, ''))
    const config = staticConnection(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')), secret = process.env.EVAL_LOCAL_COPY_INVENTORY_SECRET
    if (action === 'serve') return serve(directory, profile, config, secret)
    if (action === 'start') return console.log(JSON.stringify(await start(directory, profile, config, secret)))
    if (action === 'check') return console.log(JSON.stringify(await verifyPublished(directory, profile, config, secret)))
    if (action === 'verify-scopes') {
        await verifyPublished(directory, profile, config, secret)
        const identity = privateIdentity(profile), proposal = loadPrivate(directory, profile, secret, 'maps-e3-proposal.evalinventory', identity + ':e3:maps-e3-proposal.evalinventory').proposal
        const db = knexFactory({ client: 'mysql', connection: { ...config, database: TARGET, dateStrings: true }, log: { warn() {}, error() {} } })
        try {
            const accounts = await db('users2').select('id', 'name', 'email', 'admin', 'active', 'session_version', 'deletedAt')
            const report = { success: true, target: TARGET, sqlAuthorizationScopes: await validateScopes(db, accounts, proposal), distinctActorsVerified: 3, readOnly: true, completedUtc: new Date().toISOString() }
            fs.writeFileSync(path.join(directory, 'maps-e3-scopes-report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
            console.log(JSON.stringify(report))
        } finally { await db.destroy() }
        return
    }
    ensure(false, 'PREVIEW_ACTION_REFUSED')
}
if (require.main === module) main().catch(error => {
    process.stderr.write(JSON.stringify({ success: false, code: /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'PREVIEW_FAILED',
        location: Number(error.stack?.match(/local-inova-preview\.js:(\d+):\d+/)?.[1] || 0), privateDiagnosticsSuppressed: true }) + '\n')
    process.exitCode = 1
})
module.exports = { previewConfig, childEnvironment, composeApp, validPersistedHash, verifyPublished, responseJson, cookieName, apiOrigin, frontendOrigin }
