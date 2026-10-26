const assert = require('node:assert/strict')
const test = require('node:test')
const { recoveryTarget, applyOnlyLinkMigration, expectSqlFailure } = require('../scripts/isolated-record-links')
const migration = '20261026000100_link_registros_to_colab_id.js'

function verifiedBackup() {
    return { success: true, sourceDatabase: 'evaluation_isolated_fixture',
        restoredDatabase: 'evaluation_isolated_fixture_restore_123456abcdef',
        encryptedArtifact: 'backup-123456abcdef.evalbackup', ddlAndContentsMatch: true,
        sourceUnchanged: true, recoveredAdminAndEvaluatorLogin: true }
}

test('SQL link runner requires an explicit verified recovery copy of the selected isolated schema', () => {
    const profile = { database: 'evaluation_isolated_fixture' }
    const filename = 'recovery-report-123456abcdef.json'
    assert.deepEqual(recoveryTarget(profile, verifiedBackup(), filename), {
        id: '123456abcdef', name: 'evaluation_isolated_fixture_restore_123456abcdef' })
    for (const name of [undefined, '../' + filename, 'unrelated.json']) {
        assert.throws(() => recoveryTarget(profile, verifiedBackup(), name))
    }
    for (const changes of [{ sourceDatabase: 'another_schema' }, { restoredDatabase: profile.database },
        { encryptedArtifact: 'another-backup' }, { success: false }, { ddlAndContentsMatch: false },
        { sourceUnchanged: false }, { recoveredAdminAndEvaluatorLogin: false }]) {
        assert.throws(() => recoveryTarget(profile, { ...verifiedBackup(), ...changes }, filename))
    }
})

test('SQL link runner never applies unexpected migrations or changes a schema outside the known 11-migration baseline', async () => {
    for (const [completedCount, pending] of [[10, [migration]], [12, []], [11, ['unexpected.js']], [11, [migration, 'unexpected.js']]]) {
        await assert.rejects(applyOnlyLinkMigration({ migrate: {
            async list() { return [Array(completedCount), pending] },
            latest() { assert.fail('No migration may run after a precondition failure') }
        } }))
    }
})

test('SQL link runner requests exactly the authorized migration then verifies the completed chain', async () => {
    let applied = false
    const result = await applyOnlyLinkMigration({ migrate: {
        async list() { return applied ? [Array(12), []] : [Array(11), [migration]] },
        async latest(options) {
            assert.equal(options.tableName, 'migrations')
            assert.ok((await options.migrationSource.getMigrations()).includes(migration))
            applied = true
            return [1, [migration]]
        }
    } })
    assert.equal(result.applied, migration)
    assert.equal(result.migrationCount, 12)
})

test('SQL constraint probes accept only the expected database error and never relay SQL or row details', async () => {
    await expectSqlFailure(async () => { throw { errno: 1452, code: 'ER_NO_REFERENCED_ROW_2' } }, 1452)
    await expectSqlFailure(async () => { throw { errno: 1216, code: 'ER_NO_REFERENCED_ROW' } }, [1216, 1452])
    await expectSqlFailure(async () => { throw { errno: 1217, code: 'ER_ROW_IS_REFERENCED' } }, [1217, 1451])
    await assert.rejects(expectSqlFailure(async () => { throw {
        errno: 1364, code: 'ER_NO_DEFAULT_FOR_FIELD', message: 'synthetic private SQL details'
    } }, 1452), error => error.code === 'LINKS_EXPECTED_1452_ER_NO_DEFAULT_FOR_FIELD' && !error.message.includes('private'))
    await assert.rejects(expectSqlFailure(async () => {}, 1452), { code: 'LINKS_EXPECTED_SQL_REJECTION' })
})
