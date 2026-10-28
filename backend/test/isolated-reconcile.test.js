const test = require('node:test')
const assert = require('node:assert/strict')
const { reviewedMap, mappedSnapshot, applyMap, structure, reconcile } = require('../scripts/isolated-reconcile')

function reviewedFixture() {
    const map = Array.from({ length: 8 }, (_, i) => ({ recordId: i + 10, professionalId: 1 }))
    const inventory = { details: { professionals: [{ id: 1 }, { id: 2 }], unresolved: map.map(row => ({
        id: row.recordId, colab_id: null, candidates: [{ professionalId: 1, exactName: true }]
    })) } }
    const review = { sourceArtifact: 'inventory-c9ef67f5d8ab.evalinventory',
        sourceArtifactSha256: 'd3f4ed32e97244155fbbdb5ee17815beba38e624dea5cc8cd80fe535455e66e0',
        sourceSnapshotUnchanged: true, approvedForApplication: false,
        cases: map.map((row, i) => ({ alias: 'R' + String(i + 1).padStart(2, '0'), recordId: row.recordId,
            previousColabId: null, decision: 'pending_confirmation', candidates: [{ alias: 'P01',
                professionalId: 1, exactName: true, declaredFixtureTarget: true, assignmentHasIssue: false }] })) }
    return { map, inventory, review, profile: { id: '0f8785e640294ebbbd5490d74b01e59a' } }
}

function databaseFixture({ failAt, affectedRows = 1, timestampChange = false } = {}) {
    const { map } = reviewedFixture()
    const before = { users2: [{ id: 1, password: 'synthetic-private-hash', email: 'reviewer@example.invalid' }],
        colab: [{ id: 1, colab: 'Profissional A', demandante: 'reviewer@example.invalid' }, { id: 2, colab: 'Profissional B', demandante: 'other@example.invalid' }],
        registros: map.map(row => ({ id: row.recordId, colab_id: null, colab: 'Profissional A',
            demandante: 'original@example.invalid', nota_qualidade: '5', obs_qualidade: 'fictitious',
            created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-01T00:00:00Z') })) }
    let state = structuredClone(before), transaction
    let updates = 0, commits = 0, rollbacks = 0
    const calls = []
    const client = {
        async beginTransaction() { transaction = structuredClone(state); calls.push('BEGIN') },
        async commit() { transaction = null; commits++; calls.push('COMMIT') },
        async rollback() { if (transaction) state = transaction; transaction = null; rollbacks++; calls.push('ROLLBACK') },
        async query(sql, params) {
            calls.push({ sql, params })
            if (sql.startsWith('SET TRANSACTION')) return [[]]
            if (sql.startsWith('SELECT *')) return [structuredClone(state[params[1]])]
            assert.equal(sql, 'UPDATE ??.registros SET colab_id = ? WHERE id = ? AND colab_id IS NULL')
            updates++
            if (updates === failAt) throw new Error('private synthetic SQL failure')
            const record = state.registros.find(row => row.id === params[2] && row.colab_id === null)
            if (record) { record.colab_id = params[1]; if (timestampChange) record.updated_at = new Date('2026-02-01') }
            return [{ affectedRows: record ? affectedRows : 0 }]
        }
    }
    return { client, before, map, calls, state: () => state, counts: () => ({ updates, commits, rollbacks }) }
}

test('reviewed reconciliation accepts only the explicitly confirmed eight-to-one map and preserves the original review', () => {
    const { profile, review, inventory, map } = reviewedFixture()
    const before = structuredClone({ review, inventory })
    assert.deepEqual(reviewedMap(profile, review, inventory, 'R01-R08:P01'), map)
    assert.deepEqual({ review, inventory }, before)
    for (const approval of [undefined, '', 'all', 'R01-R08:P02']) assert.throws(() => reviewedMap(profile, review, inventory, approval))
    assert.throws(() => reviewedMap({ id: 'another-profile' }, review, inventory, 'R01-R08:P01'))
})

test('reviewed map refuses changed artifacts, aliases, duplicates, existing links and alternate candidates', () => {
    for (const alter of [
        f => { f.review.sourceArtifactSha256 = 'wrong' },
        f => { f.review.sourceArtifact = 'another.evalinventory' },
        f => { f.review.cases[0].alias = 'R99' },
        f => { f.review.cases[1].recordId = f.review.cases[0].recordId },
        f => { f.inventory.details.unresolved[0].colab_id = 1 },
        f => { f.review.cases[0].candidates[0].professionalId = 2 },
        f => { f.review.cases[0].candidates.push({ professionalId: 2 }) },
        f => { f.review.cases[0].candidates[0].assignmentHasIssue = true },
        f => { f.review.cases[0].decision = 'approved' }
    ]) {
        const f = reviewedFixture(); alter(f)
        assert.throws(() => reviewedMap(f.profile, f.review, f.inventory, 'R01-R08:P01'))
    }
})

test('application changes exactly the reviewed link fields and locks in deterministic table and record order', async () => {
    const f = databaseFixture()
    const original = structuredClone(f.before)
    const result = await applyMap(f.client, 'fixture', f.before, [...f.map].reverse())
    assert.deepEqual(result, { updated: 8, committed: true })
    assert.deepEqual(f.state(), mappedSnapshot(f.before, f.map))
    assert.deepEqual(f.before, original)
    const queries = f.calls.filter(call => typeof call === 'object')
    assert.deepEqual(queries.filter(call => call.sql.startsWith('SELECT *')).slice(0, 3).map(call => call.params[1]), ['users2', 'colab', 'registros'])
    assert.ok(queries.filter(call => call.sql.startsWith('SELECT *')).every(call => /FOR (SHARE|UPDATE)$/.test(call.sql)))
    assert.deepEqual(queries.filter(call => call.sql.startsWith('UPDATE')).map(call => call.params[2]), f.map.map(row => row.recordId))
    assert.equal(f.counts().commits, 1)
})

test('a failure after three updates rolls back the whole reviewed batch without changing accounts or professionals', async () => {
    const f = databaseFixture({ failAt: 4 })
    await assert.rejects(applyMap(f.client, 'fixture', f.before, f.map))
    assert.deepEqual(f.state(), f.before)
    assert.deepEqual(f.counts(), { updates: 4, commits: 0, rollbacks: 1 })
})

test('zero-row updates and implicit timestamp changes refuse commit and restore every field', async () => {
    for (const options of [{ affectedRows: 0 }, { timestampChange: true }]) {
        const f = databaseFixture(options)
        await assert.rejects(applyMap(f.client, 'fixture', f.before, f.map))
        assert.deepEqual(f.state(), f.before)
        assert.equal(f.counts().commits, 0)
    }
})

test('stale attribution or business state is rejected under lock before the first update', async () => {
    for (const change of [state => { state.colab[0].demandante = 'new@example.invalid' },
        state => { state.registros[0].nota_qualidade = '1' }, state => { state.users2[0].password = 'another-synthetic-hash' }]) {
        const f = databaseFixture(); change(f.state())
        const stale = structuredClone(f.state())
        await assert.rejects(applyMap(f.client, 'fixture', f.before, f.map))
        assert.deepEqual(f.state(), stale)
        assert.equal(f.counts().updates, 0)
    }
})

test('repeating an applied batch refuses to overwrite links or report another successful application', async () => {
    const f = databaseFixture()
    await applyMap(f.client, 'fixture', f.before, f.map)
    const applied = structuredClone(f.state())
    await assert.rejects(applyMap(f.client, 'fixture', f.before, f.map))
    assert.deepEqual(f.state(), applied)
    assert.deepEqual(f.counts(), { updates: 8, commits: 1, rollbacks: 1 })
    assert.throws(() => mappedSnapshot(applied, f.map))
})

test('the copy rollback probe observes all eight changes but persists none', async () => {
    const f = databaseFixture()
    assert.deepEqual(await applyMap(f.client, 'fixture', f.before, f.map, { dryRun: true }), { updated: 8, committed: false })
    assert.deepEqual(f.state(), f.before)
    assert.deepEqual(f.counts(), { updates: 8, commits: 0, rollbacks: 1 })
})

test('invalid, duplicate or nonexistent map identities fail before starting a transaction', async () => {
    for (const map of [[{ recordId: 10, professionalId: 999 }], [{ recordId: 999, professionalId: 1 }],
        [{ recordId: -1, professionalId: 1 }], [{ recordId: 10, professionalId: 1 }, { recordId: 10, professionalId: 1 }]]) {
        const f = databaseFixture()
        await assert.rejects(applyMap(f.client, 'fixture', f.before, map))
        assert.equal(f.calls.length, 0)
    }
})

test('reconciliation structure checks reject triggers, timestamp automation, changed FKs and migration baselines', async () => {
    for (const mode of ['valid', 'trigger', 'timestamp', 'foreign', 'migration']) {
        const root = { async query(sql) {
            assert.match(sql, /^SELECT /)
            if (sql.includes('isolation_marker')) return [[{ profile_id: 'fixture' }]]
            if (sql.includes('migrations')) return [Array.from({ length: mode === 'migration' ? 11 : 12 }, (_, i) => ({ name: String(i) }))]
            if (sql.includes('information_schema.TABLES')) return [[{ engine: 'InnoDB' }]]
            if (sql.includes('information_schema.TRIGGERS')) return [mode === 'trigger' ? [{ TRIGGER_NAME: 'synthetic' }] : []]
            if (sql.includes('information_schema.COLUMNS')) return [[{ name: 'colab_id', type: 'int unsigned', nullable: 'YES', extra: mode === 'timestamp' ? 'on update CURRENT_TIMESTAMP' : '' }]]
            return [[{ parentTable: 'colab', parentColumn: 'id', deleteRule: mode === 'foreign' ? 'CASCADE' : 'RESTRICT', updateRule: 'RESTRICT' }]]
        } }
        const operation = structure(root, 'fixture', Array.from({ length: 12 }, (_, i) => String(i)), 'fixture')
        if (mode === 'valid') await operation
        else await assert.rejects(operation)
    }
})

test('orchestration refuses unapproved review and target before opening application connections or writing SQL', async () => {
    for (const changes of [{ reviewReportName: 'unapproved.evalinventory' }, { profile: { id: 'unapproved-profile' } }, { confirmedMap: 'wrong' }]) {
        const f = reviewedFixture()
        await assert.rejects(reconcile({ profile: f.profile, reviewReportName: 'inventory-review-b20980a65853.evalinventory',
            confirmedMap: 'R01-R08:P01', root: { query() { assert.fail('No SQL mutation allowed') } },
            async verifyServer() { return 'fixture' }, connectApplication() { assert.fail('No application connection allowed') }, ...changes }))
    }
})
