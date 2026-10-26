const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const credentialsBefore = Object.keys(require.cache).filter(file => /[/\\]\.env$/.test(file))
const { loadProfile, verifyServer, ownedDatabase } = require('../scripts/isolated-auth')

test('isolated runner refuses absent and repository-local profiles before connecting', () => {
    assert.throws(() => loadProfile({}))
    assert.throws(() => loadProfile({ EVAL_ISOLATED_PROFILE: path.resolve(__dirname, '../../profile.json') }))
    assert.deepEqual(Object.keys(require.cache).filter(file => /[/\\]\.env$/.test(file)), credentialsBefore)
})

test('isolated server identity requires matching data directory, port and UUID', async () => {
    const profile = { dataDirectory: path.resolve('synthetic-isolated-data'), port: 50001, serverUuid: 'synthetic-uuid' }
    const correct = { directory: profile.dataDirectory, port: profile.port, uuid: profile.serverUuid, bindAddress: '127.0.0.1', version: 'synthetic-version' }
    for (const changed of [{ directory: path.resolve('different-data') }, { port: 3306 }, { uuid: 'different-uuid' }]) {
        await assert.rejects(verifyServer({ async query(sql) {
            assert.ok(sql.startsWith('SELECT ')); return [[{ ...correct, ...changed }]]
        } }, profile))
    }
    assert.equal(await verifyServer({ async query() { return [[correct]] } }, profile), 'synthetic-version')
})

test('existing schemas without the profile ownership marker are never changed', async () => {
    const calls = []
    const root = { async query(sql) {
        calls.push(sql)
        assert.ok(sql.startsWith('SELECT '))
        return calls.length === 1 ? [[{ SCHEMA_NAME: 'evaluation_isolated_synthetic' }]] : [[{ profile_id: 'different-profile' }]]
    } }
    await assert.rejects(ownedDatabase(root, { database: 'evaluation_isolated_synthetic', id: 'expected-profile' }, 'evaluation_isolated_synthetic'))
    assert.equal(calls.length, 2)
})
