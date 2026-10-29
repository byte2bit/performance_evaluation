const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const migration = require('../migrations/20261028000100_require_colab_gerencia')
const { assertApprovedTarget, assertStructure, expectedStructure, applyOnlyRequiredDepartment,
    expectRejection, assertNoWriters, runTransition, confirmationText, migrationName, enforce } = require('../scripts/isolated-required-department')
const files = fs.readdirSync(path.join(__dirname, '../migrations')).filter(name => /^\d+_.*\.js$/.test(name)).sort()

test('required department migration checks archived and orphaned links before any DDL and never backfills', async () => {
    const compiler = require('knex')({ client: 'mysql' })
    try {
        for (const total of [1, '2', undefined]) {
            const db = table => {
                const query = compiler(table)
                query.first = async () => {
                    const sql = query.toSQL().sql
                    assert.match(sql, /left join `gerencias`/); assert.match(sql, /left join `users2`/)
                    assert.match(sql, /`c`.`gerencia_id` is null or `g`.`id` is null or `u`.`id` is null/)
                    assert.doesNotMatch(sql, /deletedAt|active|insert|update|delete/i)
                    return total === undefined ? undefined : { total }
                }
                return query
            }
            db.schema = { alterTable() { assert.fail('No DDL with invalid links') } }
            await assert.rejects(migration.up(db), { code: 'PROFESSIONAL_DEPARTMENT_LINKS_REQUIRED' })
        }
    } finally { await compiler.destroy() }
})

test('required department DDL preserves unsigned type and changes only nullability, without automatic rollback', async () => {
    const compiler = require('knex')({ client: 'mysql' }), statements = []
    try {
        const db = () => {
            const query = { leftJoin() { return this }, where() { return this }, count() { return this }, async first() { return { total: '0' } } }
            return query
        }
        db.schema = { alterTable(table, change) { statements.push(...compiler.schema.alterTable(table, change).toSQL().map(row => row.sql)) } }
        await migration.up(db)
        assert.deepEqual(statements, ['alter table `colab` modify `gerencia_id` int unsigned not null'])
        assert.equal(migration.config.transaction, false)
        await assert.rejects(migration.down(), /backup/)
    } finally { await compiler.destroy() }
})

const profile = { id: '0f8785e640294ebbbd5490d74b01e59a', database: 'evaluation_isolated_0f8785e64029_v2', host: '127.0.0.1', port: 50470 }

test('required department activation accepts only the explicitly approved isolated source and exact confirmation', async () => {
    assertApprovedTarget(profile, confirmationText)
    for (const changes of [{ id: 'different' }, { database: profile.database + '_restore_123456abcdef' },
        { database: 'production' }, { host: '0.0.0.0' }, { port: 3306 }]) {
        assert.throws(() => assertApprovedTarget({ ...profile, ...changes }, confirmationText))
    }
    for (const confirmation of ['', undefined, 'approved']) {
        await assert.rejects(enforce({ profile, confirmation,
            verifyServer() { assert.fail('No connection before target/confirmation validation') } }))
    }
})

test('migration gate refuses wrong, repeated or drifted baselines and every extra pending migration before DDL', async () => {
    for (const [completed, pending] of [[files.slice(0, 12), [migrationName]], [files, []],
        [files.slice(0, 13), ['unexpected.js']], [files.slice(0, 13), [migrationName, 'unexpected.js']],
        [['unreviewed.js', ...files.slice(1, 13)], [migrationName]]]) {
        await assert.rejects(applyOnlyRequiredDepartment({ migrate: {
            async list() { return [completed, pending] }, latest() { assert.fail('No DDL after a gate failure') }
        } }))
    }
})

test('migration gate applies only migration 14 and verifies the complete resulting chain', async () => {
    let applied = false
    await applyOnlyRequiredDepartment({ migrate: {
        async list() { return applied ? [files.map(name => ({ name })), []] : [files.slice(0, 13).map(name => ({ name })), [{ file: migrationName }]] },
        async latest(options) {
            assert.equal(options.tableName, 'migrations')
            assert.deepEqual(await options.migrationSource.getMigrations(), files)
            applied = true
            return [1, [migrationName]]
        }
    } })
    assert.equal(applied, true)
})

function metadataFixture(count = 14) {
    const state = {
        markers: [{ profile_id: profile.id }], completed: files.slice(0, count).map(name => ({ name })),
        tables: Array.from({ length: 9 }, (_, i) => ({ name: String(i), engine: 'InnoDB', collation: 'fixture' })),
        columns: [{ tableName: 'colab', name: 'gerencia_id', type: 'int unsigned', nullable: count === 13 ? 'YES' : 'NO' },
            { tableName: 'gerencias', name: 'demandante_id', type: 'int unsigned', nullable: 'NO' }],
        indexes: ['gerencia_id', 'deletedAt'].map(columnName => ({ tableName: 'colab', name: 'colab_gerencia_active_index', columnName })),
        foreignKeys: [['colab', 'gerencia_id', 'gerencias'], ['gerencias', 'demandante_id', 'users2'], ['registros', 'colab_id', 'colab']]
            .map(([tableName, columnName, parentTable]) => ({ tableName, columnName, parentTable, parentColumn: 'id', deleteRule: 'RESTRICT', updateRule: 'RESTRICT' })),
        invalid: 0, objects: 0
    }
    const root = { async query(sql) {
        assert.match(sql, /^SELECT /)
        if (sql.includes('isolation_marker')) return [state.markers]
        if (sql.includes('??.migrations')) return [state.completed]
        if (sql.includes('information_schema.TABLES')) return [state.tables]
        if (sql.includes('information_schema.??')) return [[{ total: state.objects }]]
        if (sql.includes('information_schema.COLUMNS')) return [state.columns]
        if (sql.includes('information_schema.STATISTICS')) return [state.indexes]
        if (sql.includes('information_schema.KEY_COLUMN_USAGE')) return [state.foreignKeys]
        if (sql.includes('LEFT JOIN ??.gerencias')) return [[{ total: state.invalid }]]
        assert.fail('Unexpected SQL')
    } }
    return { state, root }
}

test('serving validation requires exact migrations, links, nullability, unsigned type, index and restrictive FKs', async () => {
    for (const count of [13, 14]) {
        const f = metadataFixture(count)
        const structure = await assertStructure(f.root, profile.database, count, profile.id)
        assert.equal(structure.columns[0].nullable, count === 13 ? 'YES' : 'NO')
    }
    for (const alter of [s => { s.markers[0].profile_id = 'another' }, s => { s.completed.pop() },
        s => { s.tables[0].engine = 'MyISAM' }, s => { s.columns[0].nullable = 'YES' },
        s => { s.columns[0].type = 'int' }, s => { s.columns[1].nullable = 'YES' },
        s => { s.indexes.pop() }, s => { s.foreignKeys[0].deleteRule = 'CASCADE' },
        s => { s.foreignKeys.pop() }, s => { s.invalid = 1 }, s => { s.objects = 1 }]) {
        const f = metadataFixture(); alter(f.state)
        await assert.rejects(assertStructure(f.root, profile.database, 14, profile.id))
    }
})

test('schema comparison permits only the planned nullability change and leaves the baseline untouched', () => {
    const before = metadataFixture(13).state, original = structuredClone(before)
    const after = expectedStructure(before)
    assert.equal(after.columns[0].nullable, 'NO')
    assert.deepEqual({ ...after, columns: before.columns }, before)
    assert.deepEqual(before, original)
})

test('open source or copy connections block transition without disconnecting them or changing data', async () => {
    const names = [profile.database, profile.database + '_restore_123456abcdef']
    for (const connections of [[], [{ ID: 1 }]]) {
        const root = { async query(sql, bindings) {
            assert.match(sql, /^SELECT /); assert.ok(sql.includes('ID <> CONNECTION_ID()'))
            assert.deepEqual(bindings, names); return [connections]
        } }
        if (connections.length) await assert.rejects(assertNoWriters(root, names))
        else await assertNoWriters(root, names)
    }
})

test('SQL probes reject unexpected errors and missing constraints without relaying private diagnostics', async () => {
    await expectRejection(async () => { throw { errno: 1048 } }, [1048])
    for (const operation of [async () => {}, async () => { throw { errno: 1064, message: 'synthetic private row' } }]) {
        await assert.rejects(expectRejection(operation, [1048]), error => !error.message.includes('private'))
    }
})

test('source DDL is unreachable after copy preparation, verification or source revalidation failure', async () => {
    for (const failure of ['prepareCopy', 'verifyCopy', 'revalidateSource']) {
        const calls = [], phases = [], state = { copyVerified: false, sourceSchemaAttempted: false, sourceSchemaApplied: false }
        const options = { state, checkpoint(phase) { phases.push(phase) } }
        for (const name of ['prepareCopy', 'verifyCopy', 'revalidateSource', 'applySource', 'verifySource']) {
            options[name] = async () => { calls.push(name); if (name === failure) throw new Error('synthetic verification failure') }
        }
        await assert.rejects(runTransition(options))
        assert.equal(calls.includes('applySource'), false); assert.equal(calls.includes('verifySource'), false)
        assert.equal(state.sourceSchemaAttempted, false); assert.equal(state.sourceSchemaApplied, false)
        assert.equal(phases.at(-1), 'failed')
    }
})

test('partial source DDL records attempted state and cannot claim success or run source HTTP verification', async () => {
    const phases = [], state = { copyVerified: false, sourceSchemaAttempted: false, sourceSchemaApplied: false }
    await assert.rejects(runTransition({ state, checkpoint(phase) { phases.push(phase) },
        async prepareCopy() {}, async verifyCopy() {}, async revalidateSource() {},
        async applySource() { throw new Error('synthetic implicit-commit DDL failure') },
        verifySource() { assert.fail('Source must not be reported ready after DDL failure') }
    }))
    assert.deepEqual(state, { copyVerified: true, sourceSchemaAttempted: true, sourceSchemaApplied: false })
    assert.equal(phases.at(-1), 'failed'); assert.equal(phases.includes('verified'), false)
})

test('verified transition reaches source only after copy verification and source revalidation', async () => {
    const calls = [], state = { copyVerified: false, sourceSchemaAttempted: false, sourceSchemaApplied: false }
    const options = { state, checkpoint() {} }
    for (const name of ['prepareCopy', 'verifyCopy', 'revalidateSource', 'applySource', 'verifySource']) options[name] = async () => { calls.push(name); return name }
    assert.deepEqual(await runTransition(options), { copy: 'verifyCopy', source: 'verifySource' })
    assert.deepEqual(calls, ['prepareCopy', 'verifyCopy', 'revalidateSource', 'applySource', 'verifySource'])
    assert.deepEqual(state, { copyVerified: true, sourceSchemaAttempted: true, sourceSchemaApplied: true })
})
