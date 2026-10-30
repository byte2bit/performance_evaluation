// Read-only review of the verified copy. Candidate details stay encrypted and
// never become approved assignments merely because a text comparison matches.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const mysql = require('mysql2/promise')
const { SOURCE, TARGET, staticConnection, assertScope, lockRead, snapshot } = require('./local-mysql-copy')
const { encryptDetails, decryptDetails } = require('./isolated-inventory')

function candidates({ accounts, professionals, records, links }) {
    const normalized = value => typeof value === 'string' ? value.normalize('NFC').trim().toLocaleLowerCase('pt-BR') : ''
    const users = accounts.map((account, index) => ({ id: account.id, name: account.name, email: account.email,
        admin: account.admin, deletedAt: account.deletedAt, alias: 'U' + String(index + 1).padStart(2, '0') }))
    const people = professionals.map((person, index) => ({ id: person.id, colab: person.colab, matricula: person.matricula,
        gerencia: person.gerencia, demandante: person.demandante, alias: 'P' + String(index + 1).padStart(3, '0') }))
    const labels = [...new Set(people.map(person => person.gerencia))]
    const departments = labels.map((label, index) => {
        const members = people.filter(person => person.gerencia === label)
        const ownerTexts = [...new Set(members.map(person => person.demandante))]
        const options = []
        for (const text of ownerTexts) for (const user of users.filter(user => user.deletedAt == null)) {
            const evidence = []
            if (text === user.email) evidence.push('binary-email')
            if (normalized(text) && normalized(text) === normalized(user.email)) evidence.push('normalized-email')
            if (normalized(text) && normalized(text) === normalized(user.name)) evidence.push('normalized-name')
            if (evidence.length) options.push({ ownerText: text, accountId: user.id, accountAlias: user.alias, evidence })
        }
        return { alias: 'G' + String(index + 1).padStart(2, '0'), label, ownerTexts,
            professionalIds: members.map(person => person.id), candidates: options, approvedAccountId: null }
    })
    const byRecord = new Map(records.map(record => [record.id, []]))
    for (const link of links) {
        assert.ok(byRecord.has(link.recordId))
        if (link.professionalId != null) {
            assert.ok(people.some(person => person.id === link.professionalId))
            byRecord.get(link.recordId).push(link.professionalId)
        }
    }
    const history = records.map((record, index) => ({ id: record.id, colab: record.colab, demandante: record.demandante,
        created_at: record.created_at, alias: 'R' + String(index + 1).padStart(3, '0'),
        professionalCandidates: [...new Set(byRecord.get(record.id))], approvedProfessionalId: null }))
    const summary = { accounts: users.length, professionals: people.length, records: history.length,
        departmentTextGroups: departments.length,
        departmentCandidates: departments.map(group => ({ alias: group.alias, professionals: group.professionalIds.length,
            candidateAccounts: new Set(group.candidates.map(candidate => candidate.accountId)).size })),
        recordsWithSingleCandidate: history.filter(record => record.professionalCandidates.length === 1).length,
        recordsWithoutCandidate: history.filter(record => !record.professionalCandidates.length).length,
        recordsWithAmbiguousCandidates: history.filter(record => record.professionalCandidates.length > 1).length,
        assignmentsApproved: 0, dataChanged: false }
    return { users, professionals: people, departments, records: history, summary }
}

async function main() {
    const expected = path.resolve(process.env.LOCALAPPDATA || '', 'EvaluationDev/inova-nucleo-compat-20261029')
    const directory = fs.realpathSync(process.argv[2])
    assert.equal(directory.toLowerCase(), expected.toLowerCase())
    const profile = JSON.parse(fs.readFileSync(path.join(directory, 'profile.json'), 'utf8').replace(/^\uFEFF/, ''))
    assertScope(profile, process.env.EVAL_LOCAL_COPY_CONFIRMATION)
    const secret = process.env.EVAL_LOCAL_COPY_INVENTORY_SECRET
    assert.match(secret || '', /^[a-f0-9]{64}$/)
    for (const name of ['candidates.evalinventory', 'review-report.json']) assert.equal(fs.existsSync(path.join(directory, name)), false)
    const identity = profile.id + ':' + SOURCE + ':' + TARGET
    const manifest = decryptDetails(JSON.parse(fs.readFileSync(path.join(directory, 'manifest.evalinventory'), 'utf8')), secret, identity, profile.id)
    assert.equal(manifest.profileId, profile.id); assert.equal(manifest.source, SOURCE)
    assert.equal(manifest.target, TARGET); assert.equal(manifest.serverUuid, profile.serverUuid)
    const config = staticConnection(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8'))
    const db = await mysql.createConnection({ ...config, database: TARGET, connectTimeout: 3000, multipleStatements: false,
        debug: false, trace: false, charset: 'utf8mb4', dateStrings: true, supportBigNumbers: true, bigNumberStrings: true })
    let locked = false
    try {
        const [[server]] = await db.query('SELECT DATABASE() AS name,@@port AS port,@@server_uuid AS uuid')
        assert.equal(server.name, TARGET); assert.equal(Number(server.port), 3306); assert.equal(server.uuid, profile.serverUuid)
        const tables = Object.keys(manifest.before).sort()
        assert.equal(tables.length, 9); assert.ok(tables.every(name => /^[a-zA-Z0-9_]+$/.test(name)))
        await lockRead(db, TARGET, tables); locked = true
        assert.deepEqual(await snapshot(db, TARGET, tables), manifest.before)
        const [accounts] = await db.query('SELECT id,name,email,admin,deletedAt FROM users2 ORDER BY id')
        const [professionals] = await db.query('SELECT id,colab,matricula,gerencia,demandante FROM colab ORDER BY id')
        const [records] = await db.query('SELECT id,colab,demandante,created_at FROM registros ORDER BY id')
        // Table names remain unaliased, matching their explicit READ locks.
        const [links] = await db.query('SELECT registros.id AS recordId,colab.id AS professionalId FROM ??.registros LEFT JOIN ??.colab ON colab.colab=registros.colab ORDER BY registros.id,colab.id', [TARGET, TARGET])
        const review = candidates({ accounts, professionals, records, links })
        assert.deepEqual(await snapshot(db, TARGET, tables), manifest.before)
        fs.writeFileSync(path.join(directory, 'candidates.evalinventory'), JSON.stringify(encryptDetails(review, secret, identity + ':candidates-v1', profile.id)), { flag: 'wx', mode: 0o600 })
        const report = { success: true, target: TARGET, copyMatchesVerifiedBackup: true, readOnly: true, ...review.summary,
            encryptedDetails: 'candidates.evalinventory', completedUtc: new Date().toISOString() }
        fs.writeFileSync(path.join(directory, 'review-report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
        console.log(JSON.stringify(report))
    } finally {
        try { if (locked) await db.query('UNLOCK TABLES') }
        finally { db.destroy() }
    }
}
if (require.main === module) main().catch(error => {
    const line = error.stack?.match(/local-mysql-review\.js:(\d+):\d+/)?.[1]
    console.error(JSON.stringify({ success: false, code: /^[A-Z_0-9]+$/.test(error.code || '') ? error.code : 'COPY_REVIEW_FAILED',
        ...(line ? { location: Number(line) } : {}), privateDiagnosticsSuppressed: true }))
    process.exitCode = 1
})
module.exports = { candidates }
