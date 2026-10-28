const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { collect, analyze, inventory, encryptDetails, decryptDetails } = require('../scripts/isolated-inventory')

const secret = 'ab'.repeat(32)
const migrationNames = fs.readdirSync(path.join(__dirname, '../migrations')).filter(name => /^\d+_.*\.js$/.test(name) && name <= '20261026000100_link_registros_to_colab_id.js').sort()

function fixture(t, overrides = {}) {
    const temporaryRoot = fs.realpathSync(os.tmpdir())
    const directory = fs.mkdtempSync(path.join(temporaryRoot, 'evaluation-inventory-test-'))
    t.after(() => {
        const target = fs.realpathSync(directory)
        assert.equal(path.dirname(target).toLowerCase(), temporaryRoot.toLowerCase())
        assert.match(path.basename(target), /^evaluation-inventory-test-[a-zA-Z0-9]+$/)
        fs.rmSync(target, { recursive: true, force: true })
    })
    const profile = { kind: 'evaluation-isolated-mysql-v1', id: 'a'.repeat(32), host: '127.0.0.1',
        port: 50070, generation: 2, database: 'evaluation_isolated_aaaaaaaaaaaa_v2', directory,
        dataDirectory: path.join(directory, 'data') }
    const professionals = [
        { id: 1, colab: 'José fictício', matricula: 'A1', demandante: 'current@example.invalid' },
        { id: 2, colab: 'Jose fictício', matricula: 'A1', demandante: ' OTHER@example.invalid ' },
        { id: 3, colab: 'Sem conta fictícia', matricula: null, demandante: 'missing@example.invalid' }
    ]
    const records = [
        { id: 10, colab_id: null, colab: 'José fictício', demandante: 'author@example.invalid' },
        { id: 11, colab_id: null, colab: 'Sem conta fictícia', demandante: 'admin@example.invalid' },
        { id: 12, colab_id: null, colab: 'Sem candidato fictício', demandante: 'current@example.invalid' },
        { id: 13, colab_id: 1, colab: 'José fictício', demandante: 'author@example.invalid' },
        { id: 14, colab_id: 999, colab: 'Órfão fictício', demandante: 'author@example.invalid' }
    ]
    const accounts = [
        { id: 1, email: 'current@example.invalid', active: 1, deletedAt: null },
        { id: 2, email: 'other@example.invalid', active: 0, deletedAt: null }
    ]
    const data = { professionals, records, accounts,
        candidates: [{ recordId: 10, professionalId: 1 }, { recordId: 10, professionalId: 2 }, { recordId: 11, professionalId: 3 }],
        duplicateNames: [{ id: 1, groupId: 1 }, { id: 2, groupId: 1 }],
        duplicateRegistrations: [{ id: 1, groupId: 1 }, { id: 2, groupId: 1 }] }
    const calls = []
    const client = { async query(sql, params) {
        calls.push({ sql, params })
        assert.match(sql, /^(SELECT |SET TRANSACTION ISOLATION LEVEL REPEATABLE READ$|START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY$|ROLLBACK$)/)
        if (!sql.startsWith('SELECT ')) return [[]]
        if (overrides.respond) {
            const response = overrides.respond(sql, params)
            if (response !== undefined) return [response]
        }
        if (sql === 'SELECT DATABASE() AS name') return [[{ name: profile.database }]]
        if (sql.includes('isolation_marker') && !sql.includes('information_schema')) return [[{ profile_id: profile.id }]]
        if (sql.includes('information_schema.TABLES')) return [['colab', 'registros', 'users2', 'migrations', 'isolation_marker'].map(name => ({ name, engine: 'InnoDB', collation: 'utf8mb4_0900_ai_ci' }))]
        if (sql.includes('information_schema.COLUMNS')) return [[{ tableName: 'registros', name: 'colab_id', type: 'int unsigned', nullable: 'YES', collation: null }]]
        if (sql.includes('??.migrations')) return [migrationNames.map(name => ({ name }))]
        if (sql.includes('SELECT id, colab, matricula')) return [data.professionals]
        if (sql.includes('SELECT id, colab_id')) return [data.records]
        if (sql.includes('SELECT id, email')) return [data.accounts]
        if (sql.includes('AS recordId')) return [data.candidates]
        if (sql.includes('GROUP BY colab')) return [data.duplicateNames]
        if (sql.includes('GROUP BY matricula')) return [data.duplicateRegistrations]
        assert.fail('Unexpected inventory query')
    } }
    return { profile, client, expectedMigrations: migrationNames, secret, data, calls,
        async verifyServer() { return '8.0.44-fixture' } }
}

test('inventory keeps collation candidates pending and never treats the author as the current owner', t => {
    const { data } = fixture(t)
    const before = structuredClone(data)
    const result = analyze(data)
    assert.deepEqual(data, before)
    assert.deepEqual(result.details.unresolved.map(row => row.decision), Array(3).fill('pending_review'))
    assert.deepEqual(result.details.unresolved[0].candidates, [
        { professionalId: 1, exactName: true }, { professionalId: 2, exactName: false }
    ])
    assert.equal(result.counts.unlinkedWithOneCandidate, 1)
    assert.equal(result.counts.unlinkedWithMultipleCandidates, 1)
    assert.equal(result.counts.unlinkedWithoutCandidates, 1)
    assert.equal(result.counts.collationOnlyCandidatePairs, 1)
    assert.equal(result.counts.orphanedLinks, 1)
    assert.equal(result.counts.duplicateNameGroups, 1)
    assert.equal(result.counts.duplicateRegistrationGroups, 1)
    assert.equal(result.counts.missingRegistrations, 1)
    assert.equal(result.counts.assignmentsWithoutActiveExactAccount, 2)
    assert.equal(result.counts.nonCanonicalAssignments, 1)
    assert.equal(result.counts.assignmentsWithoutAccount, 1)
    const changedAuthor = structuredClone(data)
    changedAuthor.records[0].demandante = 'current@example.invalid'
    assert.deepEqual(analyze(changedAuthor).counts, result.counts)
    assert.deepEqual(analyze(changedAuthor).details.unresolved[0].candidates, result.details.unresolved[0].candidates)
})

test('inventory diagnoses inactive, deleted, noncanonical and ambiguous accounts without normalizing stored assignments', t => {
    const { data } = fixture(t)
    data.professionals[0].demandante = 'current@example.invalid'
    data.accounts[0].deletedAt = '2026-01-01'
    data.accounts.push({ id: 3, email: ' CURRENT@example.invalid ', active: 1, deletedAt: null })
    const result = analyze(data)
    assert.equal(result.counts.nonCanonicalAccountEmails, 1)
    const issue = result.details.assignmentIssues.find(row => row.professionalId === 1)
    assert.equal(issue.accountAmbiguous, true)
    assert.equal(issue.activeExactAccountMissing, true)
    assert.equal(data.professionals[0].demandante, 'current@example.invalid')
})

test('inventory verifies isolation before data reads, uses a read-only snapshot and always rolls it back', async t => {
    const options = fixture(t)
    let verified = false
    options.verifyServer = async () => { assert.equal(options.calls.length, 0); verified = true; return 'fixture' }
    const before = structuredClone(options.data)
    const result = await collect(options)
    assert.equal(verified, true)
    assert.equal(result.metadata.migrationCount, 12)
    assert.equal(options.calls[1].sql, 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY')
    assert.equal(options.calls.at(-1).sql, 'ROLLBACK')
    assert.deepEqual(options.data, before)
    for (const { sql, params } of options.calls) {
        assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|CALL|INTO OUTFILE|FOR UPDATE)\b/)
        if (sql.includes('??')) assert.ok(params.every(value => value === options.profile.database))
        assert.doesNotMatch(sql, /\b(password|session_version|obs_qualidade|nota_qualidade)\b/)
    }
})

test('inventory rejects an unrelated profile before contacting SQL', async t => {
    for (const changes of [{ host: 'example.invalid' }, { port: 3306 }, { database: 'unrelated' },
        { directory: path.resolve(__dirname, '../..'), dataDirectory: path.resolve(__dirname, '../../data') }]) {
        const options = fixture(t)
        Object.assign(options.profile, changes)
        options.verifyServer = async () => assert.fail('Must not connect to an invalid target')
        await assert.rejects(collect(options))
        assert.equal(options.calls.length, 0)
    }
})

test('inventory stops after a server identity failure without starting a transaction', async t => {
    const options = fixture(t)
    options.verifyServer = async () => { throw new Error('synthetic identity mismatch') }
    await assert.rejects(collect(options))
    assert.equal(options.calls.length, 0)
})

test('inventory rejects a selected schema or ownership marker mismatch before reading business data', async t => {
    for (const failAt of ['selected', 'marker']) {
        const options = fixture(t, { respond(sql) {
            if (failAt === 'selected' && sql === 'SELECT DATABASE() AS name') return [{ name: 'wrong' }]
            if (failAt === 'marker' && sql === 'SELECT profile_id FROM ??.isolation_marker') return [{ profile_id: 'wrong' }]
        } })
        await assert.rejects(collect(options))
        assert.equal(options.calls.at(-1).sql, 'ROLLBACK')
        assert.ok(!options.calls.some(call => call.sql.includes('SELECT id,')))
    }
})

test('inventory refuses unknown migrations, nontransactional tables and an incompatible link column', async t => {
    for (const failAt of ['migrations', 'engine', 'column']) {
        const options = fixture(t, { respond(sql) {
            if (failAt === 'migrations' && sql.includes('??.migrations')) return migrationNames.slice(1).map(name => ({ name }))
            if (failAt === 'engine' && sql.includes('information_schema.TABLES')) return ['colab', 'registros', 'users2', 'migrations', 'isolation_marker'].map(name => ({ name, engine: 'MyISAM' }))
            if (failAt === 'column' && sql.includes('information_schema.COLUMNS')) return [{ tableName: 'registros', name: 'colab_id', type: 'varchar(255)', nullable: 'YES' }]
        } })
        await assert.rejects(collect(options))
        assert.equal(options.calls.at(-1).sql, 'ROLLBACK')
        assert.ok(!options.calls.some(call => call.sql.includes('SELECT id,')))
    }
})

test('inventory bounds isolated data volume and rolls back after a read failure', async t => {
    for (const failure of ['volume', 'sql']) {
        const options = fixture(t, { respond(sql) {
            if (sql.includes('SELECT id, colab, matricula')) {
                if (failure === 'sql') throw new Error('private synthetic SQL details')
                return Array(10001).fill({ id: 1 })
            }
        } })
        await assert.rejects(collect(options))
        assert.equal(options.calls.at(-1).sql, 'ROLLBACK')
        assert.deepEqual(fs.readdirSync(options.profile.directory), [])
    }
})

test('private inventory authenticates its key, source identity and encrypted content', () => {
    const identity = 'fixture-profile:fixture-database:fixture-artifact'
    const details = { fictionalEmail: 'private@example.invalid' }
    const envelope = encryptDetails(details, secret, identity, 'fixture-profile')
    assert.equal(JSON.stringify(envelope).includes(details.fictionalEmail), false)
    assert.deepEqual(decryptDetails(envelope, secret, identity, 'fixture-profile'), details)
    assert.throws(() => decryptDetails(envelope, 'cd'.repeat(32), identity, 'fixture-profile'))
    assert.throws(() => decryptDetails(envelope, secret, identity, 'another-profile'))
    assert.throws(() => decryptDetails(envelope, secret, 'another-source', 'fixture-profile'))
    const bytes = Buffer.from(envelope.data, 'base64'); bytes[0] ^= 1
    assert.throws(() => decryptDetails({ ...envelope, data: bytes.toString('base64') }, secret, identity, 'fixture-profile'))
})

test('inventory persists only an encrypted artifact outside the repository and returns aggregate counts', async t => {
    const options = fixture(t)
    const summary = await inventory(options)
    assert.equal(summary.readOnlyTransaction, true)
    assert.equal(summary.automaticBackfill, false)
    assert.match(summary.encryptedArtifact, /^inventory-[a-f0-9]{12}\.evalinventory$/)
    const files = fs.readdirSync(options.profile.directory)
    assert.deepEqual(files, [summary.encryptedArtifact])
    const contents = fs.readFileSync(path.join(options.profile.directory, files[0]), 'utf8')
    assert.ok(!contents.includes('example.invalid'))
    const serialized = JSON.stringify(summary)
    for (const privateValue of ['example.invalid', 'José', 'professionalId', 'recordId', secret]) assert.ok(!serialized.includes(privateValue))
    const envelope = JSON.parse(contents)
    const privateReport = decryptDetails(envelope, secret, envelope.identity, options.profile.id)
    assert.deepEqual(privateReport.counts, summary.counts)
    assert.equal(privateReport.details.unresolved.length, 3)
    assert.equal(privateReport.details.unresolved[0].demandante, 'author@example.invalid')
})

test('inventory refuses missing encryption configuration before reading or creating files', async t => {
    const options = fixture(t)
    options.secret = undefined
    await assert.rejects(inventory(options))
    assert.equal(options.calls.length, 0)
    assert.deepEqual(fs.readdirSync(options.profile.directory), [])
})
