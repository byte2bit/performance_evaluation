// Opt-in recovery exercise; never loads application credentials or production bootstrap.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { randomBytes, createHash, createCipheriv, createDecipheriv } = require('node:crypto')

function seal(plain, key, identity) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(identity))
    const data = Buffer.concat([cipher.update(plain), cipher.final()])
    return { format: 'evaluation-backup-v1', identity, iv: iv.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'), data: data.toString('base64') }
}

function unseal(envelope, key, identity) {
    assert.equal(envelope.format, 'evaluation-backup-v1')
    assert.equal(envelope.identity, identity)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'))
    decipher.setAAD(Buffer.from(identity))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()])
}

async function assertFreshTarget(root, profile, name) {
    assert.match(name, new RegExp('^' + profile.database + '_restore_[a-f0-9]{12}$'))
    assert.notEqual(name, profile.database)
    const [found] = await root.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [name])
    assert.equal(found.length, 0, 'Recovery target must not exist')
}

async function snapshot(root, name) {
    const [tables] = await root.query('SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME', [name])
    assert.ok(tables.length > 0 && tables.length <= 50)
    const result = {}
    for (const table of tables) {
        assert.equal(table.engine, 'InnoDB', 'Consistent snapshot requires transactional fixture tables')
        const [[count]] = await root.query('SELECT COUNT(*) AS count FROM ??.??', [name, table.name])
        assert.ok(Number(count.count) <= 10000, 'Runner is restricted to small fictitious schemas')
        const [ddl] = await root.query('SHOW CREATE TABLE ??.??', [name, table.name])
        const [rows] = await root.query('SELECT * FROM ??.??', [name, table.name])
        const canonical = rows.map(row => JSON.stringify(row)).sort()
        result[table.name] = { count: rows.length, ddl: ddl[0]['Create Table'],
            digest: createHash('sha256').update(JSON.stringify(canonical)).digest('hex') }
    }
    return result
}

function client(binaryDirectory, executable, config, args, input) {
    const binary = path.join(binaryDirectory, executable + '.exe')
    assert.ok(fs.existsSync(binary), 'MySQL client binary unavailable')
    const loginFile = config + '.absent-login-path'
    assert.equal(fs.existsSync(loginFile), false)
    const result = spawnSync(binary, ['--defaults-file=' + config, ...args], {
        shell: false, windowsHide: true, input, timeout: 60000, maxBuffer: 32 * 1024 * 1024,
        env: { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
            MYSQL_TEST_LOGIN_FILE: loginFile }
    })
    // Never relay stderr: SQL clients may include private row data in diagnostics.
    if (result.status !== 0) {
        const diagnostic = result.stderr?.toString('utf8') || ''
        const code = diagnostic.match(/\b(?:ERROR|mysqldump:)\s*(\d{3,5})/i)?.[1]
        const option = diagnostic.match(/unknown (?:variable|option) ['"]?([a-z][a-z0-9-]+)/i)?.[1]
        const error = new Error('MySQL client failed')
        error.code = 'RECOVERY_' + executable.toUpperCase() + '_' + (code || option || result.error?.code || result.status)
        throw error
    }
    return result.stdout
}

async function recover({ profile, root, startApplication, browser }) {
    const started = Date.now()
    assert.match(process.env.EVAL_ISOLATED_RECOVERY_KEY || '', /^[a-f0-9]{64}$/)
    const key = Buffer.from(process.env.EVAL_ISOLATED_RECOVERY_KEY, 'hex')
    const id = randomBytes(6).toString('hex')
    const target = profile.database + '_restore_' + id
    await assertFreshTarget(root, profile, target)
    const [marker] = await root.query('SELECT profile_id FROM ??.isolation_marker', [profile.database])
    assert.equal(marker[0]?.profile_id, profile.id)
    for (const [catalog, schemaColumn] of [['TRIGGERS', 'TRIGGER_SCHEMA'], ['ROUTINES', 'ROUTINE_SCHEMA'], ['EVENTS', 'EVENT_SCHEMA']]) {
        const [[objects]] = await root.query('SELECT COUNT(*) AS count FROM information_schema.?? WHERE ?? = ?', [catalog, schemaColumn, profile.database])
        assert.equal(Number(objects.count), 0, 'This fixture verifier supports tables and foreign keys only')
    }
    const before = await snapshot(root, profile.database)
    const config = path.join(profile.directory, 'recovery-client-' + id + '.cnf')
    const artifact = path.join(profile.directory, 'backup-' + id + '.evalbackup')
    const identity = profile.id + ':' + profile.database
    let dump, restoredSql, runtime
    try {
        // Short-lived option file inherits the profile's restricted ACL; no password in argv.
        fs.writeFileSync(config, '[client]\nhost=127.0.0.1\nport=' + profile.port +
            '\nprotocol=TCP\nuser=root\npassword=' + process.env.EVAL_ISOLATED_ROOT_PASSWORD + '\n', { flag: 'wx' })
        const binaries = path.dirname(profile.binary)
        dump = client(binaries, 'mysqldump', config, ['--single-transaction', '--quick', '--routines', '--events', '--triggers',
            '--set-gtid-purged=OFF', '--no-tablespaces', '--hex-blob', '--skip-comments', '--default-character-set=utf8mb4', profile.database])
        const sql = dump.toString('utf8')
        assert.equal(/^\s*(?:USE|CREATE DATABASE|DROP DATABASE)\b/im.test(sql), false)
        assert.equal(sql.includes('`' + profile.database + '`.'), false)
        fs.writeFileSync(artifact, JSON.stringify(seal(dump, key, identity)), { flag: 'wx' })
        restoredSql = unseal(JSON.parse(fs.readFileSync(artifact, 'utf8')), key, identity)
        assert.ok(createHash('sha256').update(dump).digest().equals(createHash('sha256').update(restoredSql).digest()))

        // Import is allowed only into a new namespace. Existing schemas are never overwritten.
        await assertFreshTarget(root, profile, target)
        await root.query('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci', [target])
        client(binaries, 'mysql', config, ['--binary-mode', '--default-character-set=utf8mb4', target], restoredSql)
        const restored = await snapshot(root, target)
        assert.deepEqual(restored, before, 'Restored DDL, row counts and content must match')
        assert.deepEqual(await snapshot(root, profile.database), before, 'Source changed during recovery exercise')

        await root.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ??.* TO ?@?', [target, 'evaluation_app', '127.0.0.1'])
        // Real HTTP authentication uses the recovered hashes, sessions and persistent limiters.
        runtime = await startApplication({ ...profile, database: target })
        for (const [email, password, admin] of [
            ['admin@example.invalid', process.env.EVAL_ISOLATED_ADMIN_PASSWORD, true],
            ['reviewer@example.invalid', process.env.EVAL_ISOLATED_EVALUATOR_PASSWORD, false]
        ]) {
            const user = browser(runtime)
            assert.equal((await user.login(email, password)).status, 200)
            assert.equal((await user.request('GET', '/session')).json().admin, admin)
            assert.equal((await user.request('POST', '/signout', {}, await user.csrf())).status, 204)
        }
        assert.deepEqual(await snapshot(root, profile.database), before, 'Source must remain unchanged after restored login')
        const report = { success: true, sourceDatabase: profile.database, restoredDatabase: target,
            encryptedArtifact: path.basename(artifact), encryption: 'AES-256-GCM; separate key in DPAPI vault',
            tablesCompared: Object.keys(before).length, rowsCompared: Object.values(before).reduce((sum, table) => sum + table.count, 0),
            ddlAndContentsMatch: true, sourceUnchanged: true, recoveredAdminAndEvaluatorLogin: true,
            elapsedMs: Date.now() - started, completedUtc: new Date().toISOString() }
        fs.writeFileSync(path.join(profile.directory, 'recovery-report-' + id + '.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
        return report
    } finally {
        try { if (runtime) await runtime.close() }
        finally {
            key.fill(0)
            if (dump) dump.fill(0)
            if (restoredSql) restoredSql.fill(0)
            if (fs.existsSync(config)) fs.unlinkSync(config)
        }
    }
}

module.exports = { recover, seal, unseal, assertFreshTarget }
