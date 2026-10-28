const test = require('node:test')
const assert = require('node:assert/strict')
const { validateApproval, matchesReview, applyApprovedMap, expectedState, grantCopyMigration } = require('../scripts/isolated-activate-management')

function fixture(options = {}) {
    const profile = { id: '0f8785e640294ebbbd5490d74b01e59a', database: 'evaluation_isolated_0f8785e64029_v2' }
    const users2 = [{ id: 1, name: 'Admin fictício', email: 'admin@example.invalid', admin: 1, active: 1, deletedAt: null, password: 'synthetic-hash' },
        { id: 2, name: 'Avaliador fictício', email: 'reviewer@example.invalid', admin: 0, active: 1, deletedAt: null, password: 'synthetic-hash' }]
    const colab = [{ id: 1, colab: 'Profissional fictício A', gerencia: null, demandante: 'reviewer@example.invalid' },
        { id: 2, colab: 'Profissional fictício B', gerencia: null, demandante: 'missing@example.invalid' }]
    const registros = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, colab_id: 1, demandante: 'original@example.invalid', nota_qualidade: '5', updated_at: 'synthetic-timestamp' }))
    const before = { users2, colab, registros }
    const approval = { format: 'evaluation-department-map-v1', approved: true, profileId: profile.id, sourceDatabase: profile.database,
        confirmation: 'G01:P01,P02:D02', migration: '20261027000100_add_management_departments.js', approvedUtc: '2026-10-27T20:00:00Z',
        review: { completedUtc: '2026-10-27T19:00:00Z', migrations: Array(12), professionals: colab,
            users: users2.map(({ password, ...row }) => row), records: registros.map(({ id, colab_id }) => ({ id, colab_id })) },
        departments: [{ key: 'G01', nome: 'Gerência de Testes', demandante_id: 2 }],
        professionals: [{ id: 1, departmentKey: 'G01' }, { id: 2, departmentKey: 'G01' }] }
    let state = { ...structuredClone(expectedState(before, approval)), gerencias: [] }, backup
    let updates = 0, commits = 0, rollbacks = 0
    const calls = []
    const client = {
        async beginTransaction() { backup = structuredClone(state) },
        async commit() { commits++; backup = null },
        async rollback() { rollbacks++; if (backup) state = backup; backup = null },
        async query(sql, params) {
            calls.push({ sql, params })
            if (sql.startsWith('SET TRANSACTION')) return [[]]
            if (sql.startsWith('SELECT * FROM ??.??')) return [structuredClone(state[params[1]])]
            if (sql.startsWith('SELECT * FROM ??.users2')) return [structuredClone(state.users2)]
            if (sql.startsWith('SELECT * FROM ??.colab')) return [structuredClone(state.colab)]
            if (sql.startsWith('SELECT * FROM ??.registros')) return [structuredClone(state.registros)]
            if (sql.startsWith('SELECT id FROM ??.gerencias')) return [state.gerencias.map(({ id }) => ({ id }))]
            if (sql.startsWith('SELECT id, nome')) return [structuredClone(state.gerencias)]
            if (sql.startsWith('INSERT INTO ??.gerencias')) { state.gerencias.push({ id: 7, nome: params[1], demandante_id: params[2], deletedAt: null }); return [{ insertId: 7 }] }
            assert.equal(sql, 'UPDATE ??.colab SET gerencia_id = ? WHERE id = ? AND gerencia_id IS NULL AND deletedAt IS NULL')
            updates++
            if (updates === options.failAt) throw new Error('synthetic private SQL details')
            const row = state.colab.find(item => item.id === params[2] && item.gerencia_id === null && item.deletedAt === null)
            if (row) row.gerencia_id = params[1]
            if (options.alterRecord) state.registros[0].updated_at = 'unexpected-change'
            return [{ affectedRows: options.affectedRows ?? (row ? 1 : 0) }]
        }
    }
    return { profile, approval, before, client, calls, state: () => state, counts: () => ({ updates, commits, rollbacks }) }
}

test('activation requires the exact explicitly approved source, map, department and existing evaluator', () => {
    const f = fixture()
    validateApproval(f.profile, f.approval, 'G01:P01,P02:D02')
    for (const alter of [f => { f.approval.approved = false }, f => { f.profile.id = 'another' },
        f => { f.approval.departments[0].nome = 'Unreviewed' }, f => { f.approval.departments[0].demandante_id = 1 },
        f => { f.approval.professionals[1].id = 1 }, f => { f.approval.professionals[0].departmentKey = 'other' },
        f => { f.approval.review.users[1].active = false }]) {
        const changed = fixture(); alter(changed)
        assert.throws(() => validateApproval(changed.profile, changed.approval, 'G01:P01,P02:D02'))
    }
    assert.throws(() => validateApproval(f.profile, f.approval, 'anything'))
})

test('activation refuses source identity or responsibility drift after the protected review', () => {
    const f = fixture(); matchesReview(f.before, f.approval.review)
    for (const alter of [b => { b.colab[0].demandante = 'other@example.invalid' }, b => { b.colab[1].gerencia = 'unreviewed' },
        b => { b.users2[1].email = 'changed@example.invalid' }, b => { b.registros[0].colab_id = 2 }]) {
        const changed = structuredClone(f.before); alter(changed)
        assert.throws(() => matchesReview(changed, f.approval.review))
    }
})

test('approved map inserts one department and assigns both IDs while preserving all legacy fields, accounts and evaluations', async () => {
    const f = fixture(), before = structuredClone(f.before)
    assert.deepEqual(await applyApprovedMap(f.client, 'fixture', f.before, f.approval), { departmentId: 7, professionalsAssigned: 2 })
    assert.deepEqual(f.state().colab, expectedState(f.before, f.approval, 7).colab)
    assert.deepEqual(f.state().users2, before.users2); assert.deepEqual(f.state().registros, before.registros)
    assert.equal(f.state().gerencias.length, 1); assert.deepEqual(f.before, before)
    assert.deepEqual(f.calls.filter(row => row.sql.startsWith('UPDATE')).map(row => row.params[2]), [1, 2])
    assert.deepEqual(f.counts(), { updates: 2, commits: 1, rollbacks: 0 })
})

test('partial map failures and mismatched counts roll back the new department and every assignment', async () => {
    for (const options of [{ failAt: 2 }, { affectedRows: 0 }, { alterRecord: true }]) {
        const f = fixture(options), initial = structuredClone(f.state())
        await assert.rejects(applyApprovedMap(f.client, 'fixture', f.before, f.approval))
        assert.deepEqual(f.state(), initial); assert.equal(f.counts().commits, 0); assert.equal(f.counts().rollbacks, 1)
    }
})

test('repeated or partially populated department state never overwrites prior associations', async () => {
    for (const populate of [state => { state.gerencias.push({ id: 8 }) }, state => { state.colab[1].gerencia_id = 8 }]) {
        const f = fixture(); populate(f.state()); const initial = structuredClone(f.state())
        await assert.rejects(applyApprovedMap(f.client, 'fixture', f.before, f.approval))
        assert.deepEqual(f.state(), initial); assert.equal(f.counts().updates, 0)
    }
})

test('migration privileges are granted only to the identified new recovery copy, never the source or another schema', async () => {
    const profile = { database: 'evaluation_isolated_fixture' }, calls = []
    const root = { async query(sql, bindings) { calls.push({ sql, bindings }) } }
    for (const name of [profile.database, 'another_restore_123456abcdef', profile.database + '_restore_wrong', profile.database + '_restore_123456abcdef_extra']) {
        await assert.rejects(grantCopyMigration(root, profile, name))
    }
    assert.equal(calls.length, 0)
    const name = profile.database + '_restore_123456abcdef'
    await grantCopyMigration(root, profile, name)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].bindings, [name, 'evaluation_migrator', '127.0.0.1'])
    assert.match(calls[0].sql, /ON \?\?\.\* TO \?@\?$/)
})
