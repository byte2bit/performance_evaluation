// Opt-in, read-only inventory. No application bootstrap, migrations or SMTP.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomBytes, hkdfSync, createCipheriv, createDecipheriv } = require('node:crypto')
const { normalizeEmail, active } = require('../lib/auth/identity')

const maxRows = 10000
const tableNames = ['colab', 'registros', 'users2', 'migrations', 'isolation_marker']
const sql = {
    selected: 'SELECT DATABASE() AS name',
    marker: 'SELECT profile_id FROM ??.isolation_marker',
    tables: 'SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?, ?, ?) ORDER BY TABLE_NAME',
    columns: 'SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?) ORDER BY TABLE_NAME, ORDINAL_POSITION',
    migrations: 'SELECT name FROM ??.migrations ORDER BY name',
    professionals: 'SELECT id, colab, matricula, demandante FROM ??.colab ORDER BY id LIMIT 10001',
    records: 'SELECT id, colab_id, colab, demandante, created_at, updated_at FROM ??.registros ORDER BY id LIMIT 10001',
    accounts: 'SELECT id, email, active, deletedAt FROM ??.users2 ORDER BY id LIMIT 10001',
    candidates: 'SELECT r.id AS recordId, c.id AS professionalId FROM ??.registros r INNER JOIN ??.colab c ON r.colab = c.colab WHERE r.colab_id IS NULL ORDER BY r.id, c.id LIMIT 10001',
    duplicateNames: 'SELECT c.id, g.groupId FROM ??.colab c INNER JOIN (SELECT MIN(id) AS groupId, colab FROM ??.colab GROUP BY colab HAVING COUNT(*) > 1) g ON c.colab = g.colab ORDER BY g.groupId, c.id LIMIT 10001',
    duplicateRegistrations: "SELECT c.id, g.groupId FROM ??.colab c INNER JOIN (SELECT MIN(id) AS groupId, matricula FROM ??.colab WHERE matricula IS NOT NULL AND TRIM(matricula) <> '' GROUP BY matricula HAVING COUNT(*) > 1) g ON c.matricula = g.matricula ORDER BY g.groupId, c.id LIMIT 10001"
}

function checkProfile(profile) {
    assert.equal(profile.kind, 'evaluation-isolated-mysql-v1')
    assert.match(profile.id, /^[a-f0-9]{32}$/)
    assert.equal(profile.host, '127.0.0.1')
    assert.ok(Number.isInteger(profile.port) && profile.port > 1024 && profile.port <= 65535 && profile.port !== 3306)
    const generation = profile.generation || 1
    assert.ok(Number.isInteger(generation) && generation >= 1 && generation <= 20)
    assert.equal(profile.database, 'evaluation_isolated_' + profile.id.slice(0, 12) + (generation === 1 ? '' : '_v' + generation))
    const directory = fs.realpathSync(profile.directory)
    const workspace = fs.realpathSync(path.resolve(__dirname, '../..'))
    const relative = path.relative(workspace, directory)
    assert.ok(relative && (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)))
    assert.equal(path.resolve(profile.dataDirectory).toLowerCase(), path.join(directory, 'data').toLowerCase())
}

function groups(rows) {
    const result = new Map()
    for (const row of rows) {
        if (!result.has(row.groupId)) result.set(row.groupId, [])
        result.get(row.groupId).push(row.id)
    }
    return [...result.values()]
}

function analyze({ professionals, records, accounts, candidates, duplicateNames, duplicateRegistrations }) {
    const byId = new Map(professionals.map(row => [row.id, row]))
    const accountByEmail = new Map()
    for (const account of accounts) {
        const canonical = normalizeEmail(account.email)
        if (canonical) {
            if (!accountByEmail.has(canonical)) accountByEmail.set(canonical, [])
            accountByEmail.get(canonical).push(account)
        }
    }
    const assignmentIssues = professionals.map(row => {
        const canonical = normalizeEmail(row.demandante)
        const matches = canonical ? accountByEmail.get(canonical) || [] : []
        return { professionalId: row.id, invalidEmail: !canonical,
            nonCanonicalEmail: Boolean(canonical && canonical !== row.demandante),
            accountMissing: matches.length === 0, accountAmbiguous: matches.length > 1,
            activeExactAccountMissing: !matches.some(account => active(account) && account.email === row.demandante) }
    }).filter(row => row.invalidEmail || row.nonCanonicalEmail || row.accountMissing || row.accountAmbiguous || row.activeExactAccountMissing)
    const candidatesByRecord = new Map()
    for (const pair of candidates) {
        if (!candidatesByRecord.has(pair.recordId)) candidatesByRecord.set(pair.recordId, [])
        candidatesByRecord.get(pair.recordId).push(pair.professionalId)
    }
    const unresolved = records.filter(row => row.colab_id === null).map(row => ({
        ...row, decision: 'pending_review',
        candidates: (candidatesByRecord.get(row.id) || []).map(id => ({
            professionalId: id, exactName: row.colab === byId.get(id).colab
        }))
    }))
    const names = groups(duplicateNames)
    const registrations = groups(duplicateRegistrations)
    const counts = {
        records: records.length, professionals: professionals.length, accounts: accounts.length,
        unlinkedRecords: unresolved.length,
        linkedRecords: records.filter(row => row.colab_id !== null).length,
        orphanedLinks: records.filter(row => row.colab_id !== null && !byId.has(row.colab_id)).length,
        unlinkedWithoutCandidates: unresolved.filter(row => !row.candidates.length).length,
        unlinkedWithOneCandidate: unresolved.filter(row => row.candidates.length === 1).length,
        unlinkedWithMultipleCandidates: unresolved.filter(row => row.candidates.length > 1).length,
        collationOnlyCandidatePairs: unresolved.reduce((count, row) => count + row.candidates.filter(item => !item.exactName).length, 0),
        duplicateNameGroups: names.length, duplicateRegistrationGroups: registrations.length,
        missingRegistrations: professionals.filter(row => !row.matricula || !row.matricula.trim()).length,
        assignmentsWithIssues: assignmentIssues.length,
        nonCanonicalAssignments: assignmentIssues.filter(row => row.nonCanonicalEmail).length,
        assignmentsWithoutAccount: assignmentIssues.filter(row => row.accountMissing).length,
        assignmentsWithoutActiveExactAccount: assignmentIssues.filter(row => row.activeExactAccountMissing).length,
        nonCanonicalAccountEmails: accounts.filter(row => normalizeEmail(row.email) !== row.email).length
    }
    return { counts, details: { unresolved, professionals, assignmentIssues,
        orphanedLinks: records.filter(row => row.colab_id !== null && !byId.has(row.colab_id)),
        duplicateNameGroups: names, duplicateRegistrationGroups: registrations } }
}

async function collect({ client, profile, verifyServer, expectedMigrations }) {
    checkProfile(profile)
    const version = await verifyServer(client, profile)
    let started = false
    try {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        await client.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY')
        started = true
        const [[selected]] = await client.query(sql.selected)
        assert.equal(selected.name, profile.database)
        const [markers] = await client.query(sql.marker, [profile.database])
        assert.equal(markers.length, 1)
        assert.equal(markers[0].profile_id, profile.id)
        const [tables] = await client.query(sql.tables, [profile.database, ...tableNames])
        assert.deepEqual(tables.map(row => row.name).sort(), [...tableNames].sort())
        assert.ok(tables.every(row => row.engine === 'InnoDB'))
        const [migrations] = await client.query(sql.migrations, [profile.database])
        assert.equal(expectedMigrations.length, 12)
        assert.deepEqual(migrations.map(row => row.name), [...expectedMigrations].sort())
        const [columns] = await client.query(sql.columns, [profile.database, 'registros', 'colab', 'users2'])
        const link = columns.find(row => row.tableName === 'registros' && row.name === 'colab_id')
        assert.equal(link?.type, 'int unsigned')
        assert.equal(link.nullable, 'YES')
        const data = {}
        for (const name of ['professionals', 'records', 'accounts', 'candidates', 'duplicateNames', 'duplicateRegistrations']) {
            const [rows] = await client.query(sql[name], [profile.database, ...(
                ['candidates', 'duplicateNames', 'duplicateRegistrations'].includes(name) ? [profile.database] : [])])
            assert.ok(rows.length <= maxRows, 'Inventory limited to small isolated datasets')
            data[name] = rows
        }
        const result = analyze(data)
        return { ...result, metadata: { mysqlVersion: version, migrationCount: migrations.length, tables, columns } }
    } finally {
        if (started) await client.query('ROLLBACK')
    }
}

function inventoryKey(secret, profileId) {
    assert.match(secret || '', /^[a-f0-9]{64}$/)
    return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'hex'), Buffer.from(profileId), 'evaluation-inventory-v1', 32))
}

function encryptDetails(details, secret, identity, profileId) {
    const key = inventoryKey(secret, profileId)
    const plain = Buffer.from(JSON.stringify(details))
    try {
        const iv = randomBytes(12)
        const cipher = createCipheriv('aes-256-gcm', key, iv)
        cipher.setAAD(Buffer.from(identity))
        return { format: 'evaluation-inventory-v1', identity, iv: iv.toString('hex'),
            data: Buffer.concat([cipher.update(plain), cipher.final()]).toString('base64'), tag: cipher.getAuthTag().toString('hex') }
    } finally { key.fill(0); plain.fill(0) }
}

// For a future protected review workflow; never print the returned private data.
function decryptDetails(envelope, secret, identity, profileId) {
    assert.equal(envelope.format, 'evaluation-inventory-v1')
    assert.equal(envelope.identity, identity)
    const key = inventoryKey(secret, profileId)
    let plain
    try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'))
        decipher.setAAD(Buffer.from(identity))
        decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'))
        plain = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()])
        return JSON.parse(plain.toString('utf8'))
    } finally { key.fill(0); if (plain) plain.fill(0) }
}

async function inventory(options) {
    const { profile } = options
    // Validate encryption configuration before reading private rows.
    const probeKey = inventoryKey(options.secret, profile.id); probeKey.fill(0)
    const result = await collect(options)
    const id = randomBytes(6).toString('hex')
    const filename = 'inventory-' + id + '.evalinventory'
    const identity = profile.id + ':' + profile.database + ':' + id
    const completedUtc = new Date().toISOString()
    const envelope = encryptDetails({ completedUtc, ...result }, options.secret, identity, profile.id)
    // Exclusive creation, fixed basename and canonical external directory; no plaintext artifact.
    fs.writeFileSync(path.join(fs.realpathSync(profile.directory), filename), JSON.stringify(envelope), { flag: 'wx', mode: 0o600 })
    return { success: true, completedUtc, readOnlyTransaction: true, automaticBackfill: false,
        mysqlVersion: result.metadata.mysqlVersion, migrationCount: result.metadata.migrationCount,
        counts: result.counts, encryptedArtifact: filename }
}

module.exports = { inventory, collect, analyze, encryptDetails, decryptDetails }
