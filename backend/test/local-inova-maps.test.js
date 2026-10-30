const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const knex = require('knex')
const { SOURCE, TARGET } = require('../scripts/local-mysql-copy')
const { run, proposalFrom, applyMap, expectedRows, compareSnapshots, compareCatalog, migrationSource, migrationNames, third,
    assertStage, assertPortFree, E3_CONFIRMATION, digest } = require('../scripts/local-inova-maps')
const { authorize, assertAuthorized } = require('../compat/inova/maps-scope')
const migration = require('../compat/inova/migrations/' + third)

const profile = { kind: 'evaluation-local-mysql-copy-v1', id: 'a'.repeat(32), host: '127.0.0.1', port: 3306,
    source: SOURCE, target: TARGET, serverUuid: '00000000-0000-0000-0000-000000000001' }
const config = { host: '127.0.0.1', port: 3306, database: SOURCE, user: 'synthetic', password: 'synthetic' }
function data() {
    const sizes = [40, 23, 16, 20, 1], professionals = []; let id = 0
    sizes.forEach((size, i) => { for (let n = 0; n < size; n++) professionals.push({ id: ++id, colab: 'Synthetic person ' + id,
        gerencia: 'Synthetic group ' + (i + 1), gerencia_id: null, deletedAt: null, demandante: 'Original synthetic text' }) })
    const records = Array.from({ length: 498 }, (_, i) => ({ id: i + 1, colab: i < 395 ? professionals[i % 100].colab : i < 440 ? professionals[i % 100].colab.toLowerCase() : 'No candidate ' + i,
        colab_id: null, demandante: 'Original author snapshot', obs_qualidade: i % 2 ? null : 'Long synthetic observation '.repeat(50), created_at: '2025-02-01 00:00:00' }))
    const allPairs = records.slice(0, 440).map((row, i) => ({ recordId: row.id, professionalId: professionals[i % 100].id }))
    const accounts = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, active: 1, session_version: 1, deletedAt: null, admin: i < 2 ? 1 : 0 }))
    return { professionals, records, accounts, pairs: allPairs.slice(0, 395), allPairs }
}
const propose = fixture => proposalFrom(fixture.professionals, fixture.records, fixture.pairs, fixture.allPairs, fixture.accounts)

test('E3 requires its own confirmation, exact approved target and unchanged connection before any I/O', async () => {
    assertStage(profile, config, E3_CONFIRMATION)
    for (const change of [{ confirmation: '' }, { profile: { ...profile, target: SOURCE } }, { profile: { ...profile, target: 'another_copy' } },
        { config: { ...config, port: 50470 } }, { config: { ...config, database: TARGET } }]) {
        await assert.rejects(run({ action: 'apply', profile, config, confirmation: E3_CONFIRMATION, ...change,
            connector() { assert.fail('Forbidden connection') }, storage: { existsSync() { assert.fail('Forbidden I/O') } } }))
    }
})

test('existing E3 artifacts block replay before ports, decryption or connection', async () => {
    await assert.rejects(run({ action: 'apply', profile, config, confirmation: E3_CONFIRMATION, directory: 'synthetic',
        secret: 'a'.repeat(64), backupKey: Buffer.alloc(32), storage: { existsSync() { return true } } }), { code: 'E3_ARTIFACT_EXISTS' })
})

test('proposal partitions all 100 IDs by first occurrence and selects exactly 395 binary pairs with 103 untouched', () => {
    const fixture = data(), proposal = propose(fixture)
    assert.deepEqual(proposal.groups.map(row => [row.id, row.professionalIds.length, row.ownerId]), [[1, 40, 12], [2, 23, 12], [3, 16, 12], [4, 20, 12], [5, 1, 12]])
    assert.equal(proposal.pairs.length, 395); assert.equal(proposal.pending.length, 103)
    assert.equal(proposal.pending.filter(row => row.reason === 'collation-only').length, 45)
    assert.equal(proposal.pending.filter(row => row.reason === 'no-candidate').length, 58)
    const changed = expectedRows(fixture, proposal, [])
    assert.equal(changed.registros.filter(row => row.colab_id === null).length, 103)
    for (const row of changed.registros) assert.deepEqual({ ...row, colab_id: null }, fixture.records.find(original => original.id === row.id))
    for (const row of changed.colab) assert.deepEqual({ ...row, gerencia_id: null }, fixture.professionals.find(original => original.id === row.id))
})

test('proposal rejects owner/state/label changes, collation-only pairs, ambiguous pairs and unexpected coverage', () => {
    for (const issue of ['owner', 'version', 'label', 'group', 'already-linked', 'collation', 'duplicate', 'missing']) {
        const fixture = data()
        if (issue === 'owner') fixture.accounts[11].active = 0
        if (issue === 'version') fixture.accounts[0].session_version = 2
        if (issue === 'label') fixture.professionals[0].gerencia = ' '
        if (issue === 'group') fixture.professionals[0].gerencia = fixture.professionals.at(-1).gerencia
        if (issue === 'already-linked') fixture.records[0].colab_id = 1
        if (issue === 'collation') fixture.pairs[0] = fixture.allPairs[395]
        if (issue === 'duplicate') fixture.pairs[0] = fixture.pairs[1]
        if (issue === 'missing') fixture.professionals.pop()
        assert.throws(() => propose(fixture), issue)
    }
})

function mapDb(fail = false) {
    const originals = data(), proposal = propose(originals)
    let rows = structuredClone(originals), departments = [], saved, commits = 0, rollbacks = 0
    const queries = []
    const db = {
        async beginTransaction() { saved = { rows: structuredClone(rows), departments: structuredClone(departments) } },
        async commit() { commits++ }, async rollback() { rows = saved.rows; departments = saved.departments; rollbacks++ },
        async query(sql, bindings = []) {
            queries.push({ sql, bindings })
            if (sql.includes('CURRENT_TIMESTAMP')) return [[{ instant: '2026-10-29 23:30:00' }]]
            assert.equal(bindings[0], TARGET)
            if (sql.startsWith('SELECT *')) return [structuredClone(rows[sql.includes('users2') ? 'accounts' : sql.includes('colab') ? 'professionals' : 'records'])]
            if (sql.startsWith('SELECT COUNT')) return [[{ n: departments.length }]]
            if (sql.startsWith('INSERT')) { departments.push({ id: bindings[1], nome: bindings[2], demandante_id: bindings[3], deletedAt: bindings[4], created_at: bindings[5], updated_at: bindings[6] }); return [{ affectedRows: 1 }] }
            if (sql.includes('.colab SET')) { rows.professionals.find(row => row.id === bindings[2]).gerencia_id = bindings[1]; return [{ affectedRows: 1 }] }
            assert.match(sql, /^UPDATE \?\?\.registros SET colab_id=\? WHERE id=\? AND colab_id IS NULL AND CAST\(colab AS BINARY\)=CAST\(\? AS BINARY\)$/)
            if (fail && bindings[2] === 17) return [{ affectedRows: 0 }]
            const row = rows.records.find(row => row.id === bindings[2]); assert.equal(row.colab, bindings[3]); row.colab_id = bindings[1]
            return [{ affectedRows: 1 }]
        }
    }
    return { db, originals, proposal, queries, get state() { return { rows, departments, commits, rollbacks } } }
}

test('map transaction updates only department/record IDs and inserts the five approved departments; rehearsal reverts all rows', async () => {
    const h = mapDb()
    await applyMap(h.db, h.proposal, h.originals, true)
    assert.deepEqual(h.state.rows, h.originals); assert.equal(h.state.departments.length, 0); assert.equal(h.state.rollbacks, 1)
    const departments = await applyMap(h.db, h.proposal, h.originals, false)
    const expected = expectedRows(h.originals, h.proposal, departments)
    assert.deepEqual(h.state.rows.accounts, h.originals.accounts)
    assert.deepEqual(h.state.rows.professionals, expected.colab); assert.deepEqual(h.state.rows.records, expected.registros)
    assert.equal(h.state.commits, 1); assert.equal(h.state.departments.length, 5)
    assert.equal(h.queries.filter(row => row.sql.startsWith('UPDATE')).length, 990)
    assert.ok(h.queries.filter(row => row.sql.startsWith('UPDATE')).every(row => !/SET.*(password|session_version|obs_|created_at|updated_at)=/.test(row.sql)))
})

test('one failed conditional update rolls back all 100 professional links, preceding record links and new departments', async () => {
    const h = mapDb(true)
    await assert.rejects(applyMap(h.db, h.proposal, h.originals, false), { code: 'E3_RECORD_UPDATE_FAILED' })
    assert.deepEqual(h.state.rows, h.originals); assert.equal(h.state.departments.length, 0)
    assert.equal(h.state.commits, 0); assert.equal(h.state.rollbacks, 1)
})

test('snapshot comparison permits only approved rows, the department counter, one ledger append and the required nullable change', () => {
    const fixture = data(), proposal = propose(fixture), departments = proposal.groups.map(row => ({ id: row.id, nome: row.name }))
    const before = {
        colab: { count: 100, digest: digest(fixture.professionals), ddl: 'CREATE TABLE `colab` (`gerencia_id` int unsigned DEFAULT NULL) ENGINE=InnoDB' },
        registros: { count: 498, digest: digest(fixture.records), ddl: 'CREATE TABLE registros ENGINE=InnoDB' },
        gerencias: { count: 0, digest: digest([]), ddl: 'CREATE TABLE gerencias ENGINE=InnoDB' },
        users2: { count: 25, digest: digest(fixture.accounts), ddl: 'CREATE TABLE users2 ENGINE=InnoDB' },
        inova_compat_migrations: { count: 2, digest: 'old-ledger', ddl: 'CREATE TABLE inova_compat_migrations ENGINE=InnoDB AUTO_INCREMENT=3' }
    }
    const rows = expectedRows(fixture, proposal, departments), after = structuredClone(before)
    for (const [name, data] of Object.entries(rows)) { after[name].count = data.length; after[name].digest = digest(data) }
    after.gerencias.ddl += ' AUTO_INCREMENT=6'
    compareSnapshots(before, after, rows)
    const ledger = migrationNames.map((name, i) => ({ id: i + 1, name, batch: i === 2 ? 2 : 1 }))
    after.colab.ddl = after.colab.ddl.replace('DEFAULT NULL', 'NOT NULL')
    after.inova_compat_migrations = { count: 3, digest: digest(ledger), ddl: before.inova_compat_migrations.ddl.replace('=3', '=4') }
    compareSnapshots(before, after, rows, true, ledger)
    for (const area of ['users2', 'registros', 'gerencias']) {
        const changed = structuredClone(after); changed[area].digest = 'changed-other-value'
        assert.throws(() => compareSnapshots(before, changed, rows, true, ledger))
    }
    const counter = structuredClone(after); counter.gerencias.ddl = counter.gerencias.ddl.replace('=6', '=7')
    assert.throws(() => compareSnapshots(before, counter, rows, true, ledger))
})

test('catalog comparison preserves unsigned, all original columns/indexes/FKs and permits only gerencia nullable YES to NO', () => {
    const before = { columns: [{ t: 'colab', name: 'gerencia_id', type: 'int unsigned', nullable: 'YES', def: null }, { t: 'registros', name: 'obs_qualidade', type: 'text', nullable: 'YES' }], indexes: [{ name: 'existing' }], foreignKeys: [{ onDelete: 'RESTRICT' }] }
    const after = structuredClone(before); after.columns[0].nullable = 'NO'
    compareCatalog(before, after, true)
    for (const issue of ['signed', 'text', 'index', 'cascade']) {
        const changed = structuredClone(after)
        if (issue === 'signed') changed.columns[0].type = 'int'
        if (issue === 'text') changed.columns[1].type = 'varchar(255)'
        if (issue === 'index') changed.indexes = []
        if (issue === 'cascade') changed.foreignKeys[0].onDelete = 'CASCADE'
        assert.throws(() => compareCatalog(before, changed, true))
    }
})

test('third migration compiles only unsigned NOT NULL and refuses startup/default/shared execution or down', async () => {
    const db = knex({ client: 'mysql' })
    try {
        const sql = migration.change(db).toSQL().map(query => query.sql).join('\n')
        assert.match(sql, new RegExp('alter table `' + TARGET + '`\\.`colab` modify `gerencia_id` int unsigned not null', 'i'))
        assert.doesNotMatch(sql, /drop|delete|insert|update|charset|collate|password/i)
        assert.equal(migration.config.transaction, false)
        await assert.rejects(migration.up(db), { code: 'E3_RUNNER_REQUIRED' }); await assert.rejects(migration.down())
        const source = migrationSource(); assert.deepEqual(await source.getMigrations(), migrationNames)
        await assert.rejects(source.getMigration('20261028000100_require_colab_gerencia.js'))
    } finally { await db.destroy() }
})

test('E3 capability and live identity cannot be reused against the original database or different server', async () => {
    const db = { userParams: {}, client: { config: { connection: { ...config, database: TARGET } } },
        async raw() { return [[{ name: TARGET, port: 3306, uuid: profile.serverUuid, version: '8.0.44' }]] } }
    assert.throws(() => authorize(db, profile, ''))
    authorize(db, profile, E3_CONFIRMATION); await assertAuthorized(db)
    db.client.config.connection.database = SOURCE
    await assert.rejects(assertAuthorized(db), { code: 'E3_RUNNER_REQUIRED' })
    db.client.config.connection.database = TARGET
    db.raw = async () => [[{ name: TARGET, port: 3306, uuid: 'other', version: '8.0.44' }]]
    await assert.rejects(assertAuthorized(db), { code: 'E3_SERVER_CHANGED' })
})

test('occupied ports are rejected without stopping another server or selecting a replacement', async () => {
    const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    try { await assert.rejects(assertPortFree(server.address().port), { code: 'E3_PREVIEW_PORT_BUSY' }); assert.equal(server.listening, true) }
    finally { await new Promise(resolve => server.close(resolve)) }
})
