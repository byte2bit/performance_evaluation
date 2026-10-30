const assert = require('node:assert/strict')
const test = require('node:test')
const { approvedTarget, validate, waitForTwoWriters, confirmationText } = require('../scripts/isolated-monthly-records')
const { recover } = require('../scripts/isolated-recovery')

const profile = { id: '0f8785e640294ebbbd5490d74b01e59a', database: 'evaluation_isolated_0f8785e64029_v2', host: '127.0.0.1', port: 50470 }
const copyId = '20261029a001'

test('monthly SQL validation requires the exact fictional source, explicit confirmation and fresh-copy identifier', async () => {
    assert.equal(approvedTarget(profile, confirmationText, copyId), profile.database + '_restore_' + copyId)
    for (const change of [{ id: 'f'.repeat(32) }, { database: 'production' }, { host: 'remote.example.invalid' }, { port: 3306 }, { port: 50070 }]) {
        await assert.rejects(validate({ profile: { ...profile, ...change }, confirmation: confirmationText, copyId,
            verifyServer() { assert.fail('An unapproved source must not be contacted') } }))
    }
    for (const [confirmation, identifier] of [[null, copyId], ['approve everything', copyId], [confirmationText, null],
        [confirmationText, '../overwrite'], [confirmationText, '20261029A001']]) {
        await assert.rejects(validate({ profile, confirmation, copyId: identifier,
            verifyServer() { assert.fail('No SQL before copy scope confirmation') } }))
    }
})

test('monthly SQL validation cannot create a copy if server identity or baseline 14 validation fails', async () => {
    const failure = new Error('synthetic source precondition failure')
    for (const stage of ['server', 'structure']) {
        let recoveryCalls = 0
        await assert.rejects(validate({ profile, confirmation: confirmationText, copyId,
            async verifyServer() { if (stage === 'server') throw failure },
            async structure(root, name, count, id) {
                assert.equal(name, profile.database); assert.equal(count, 14); assert.equal(id, profile.id)
                throw failure
            },
            async recovery() { recoveryCalls++; assert.fail('No copy after a failed source precondition') },
        }), error => error === failure)
        assert.equal(recoveryCalls, 0)
    }
})

test('copy validation never runs fixtures if recovery is unsuccessful, changes source state or returns a different target', async () => {
    for (const change of [{ success: false }, { sourceUnchanged: false }, { ddlAndContentsMatch: false }, { restoredDatabase: profile.database }]) {
        const reads = []
        await assert.rejects(validate({ profile, confirmation: confirmationText, copyId,
            root: { async query(sql, bindings) { assert.match(sql, /^SELECT /); reads.push(bindings); return [[]] } },
            async verifyServer() {}, async structure() {},
            async recovery(options) {
                assert.equal(options.backupId, copyId)
                return { success: true, sourceUnchanged: true, ddlAndContentsMatch: true,
                    restoredDatabase: profile.database + '_restore_' + copyId, ...change }
            },
            startApplication() { assert.fail('No application fixtures before confirming the recovery target') },
        }))
        assert.deepEqual(reads, [[profile.database], ...['users2', 'gerencias', 'colab', 'registros'].map(table => [profile.database, table])])
    }
})

test('a source connection blocks recovery before any backup, copy creation or fixture writes', async () => {
    let recoveryCalls = 0
    await assert.rejects(validate({ profile, confirmation: confirmationText, copyId,
        async verifyServer() {}, async structure() {},
        root: { async query(sql, bindings) {
            assert.match(sql, /information_schema\.PROCESSLIST/)
            assert.deepEqual(bindings, [profile.database])
            return [[{ ID: 99 }]]
        } },
        async recovery() { recoveryCalls++; assert.fail('Source connections must block recovery') },
    }))
    assert.equal(recoveryCalls, 0)
})

test('the SQL race barrier requires two observed waits and fails if either HTTP request settles early', async () => {
    const counts = [0, 1, 2], calls = []
    const root = { async query(sql, bindings) {
        assert.match(sql, /^SELECT COUNT\(\*\).*performance_schema\.data_lock_waits/)
        calls.push(bindings)
        return [[{ count: counts.shift() }]]
    } }
    await waitForTwoWriters(root, 'fictional_copy', () => false, { pause: async () => {} })
    assert.equal(calls.length, 3)
    assert.ok(calls.every(bindings => bindings[0] === 'fictional_copy' && bindings[1] === 'colab'))
    await assert.rejects(waitForTwoWriters({ async query() { return [[{ count: 2 }]] } }, 'fictional_copy', () => true))
    await assert.rejects(waitForTwoWriters({ async query() { return [[{ count: 0 }]] } }, 'fictional_copy', () => false,
        { timeout: -1, pause: async () => {} }), { code: 'MONTHLY_LOCK_WAITS_NOT_OBSERVED' })
})

test('an explicit backup identifier cannot escape its namespace or reach SQL clients', async () => {
    const previous = process.env.EVAL_ISOLATED_RECOVERY_KEY
    process.env.EVAL_ISOLATED_RECOVERY_KEY = '0'.repeat(64)
    try {
        await assert.rejects(recover({ profile, backupId: '../overwrite',
            root: { query() { assert.fail('Invalid backup identity must fail before SQL') } } }))
    } finally {
        if (previous === undefined) delete process.env.EVAL_ISOLATED_RECOVERY_KEY
        else process.env.EVAL_ISOLATED_RECOVERY_KEY = previous
    }
})
