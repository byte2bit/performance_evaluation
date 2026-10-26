const test = require('node:test')
const assert = require('node:assert/strict')
const { randomBytes } = require('node:crypto')
const { seal, unseal, assertFreshTarget } = require('../scripts/isolated-recovery')

test('backup encryption authenticates ciphertext, key and source identity', () => {
    const key = randomBytes(32)
    const plain = Buffer.from('fictitious local SQL fixture')
    const envelope = seal(plain, key, 'fixture-profile:fixture-database')
    assert.deepEqual(unseal(envelope, key, envelope.identity), plain)
    assert.throws(() => unseal(envelope, randomBytes(32), envelope.identity))
    assert.throws(() => unseal(envelope, key, 'another-profile:another-database'))
    const tampered = Buffer.from(envelope.data, 'base64'); tampered[0] ^= 1
    assert.throws(() => unseal({ ...envelope, data: tampered.toString('base64') }, key, envelope.identity))
})

test('recovery refuses source, unrelated or existing target schemas before any writes', async () => {
    const profile = { database: 'evaluation_isolated_fixture' }
    const root = { async query(sql) { assert.ok(sql.startsWith('SELECT ')); return [[{ SCHEMA_NAME: 'already-existing' }]] } }
    for (const name of [profile.database, 'unrelated_restore_123456abcdef', profile.database + '_restore_123456abcdef']) {
        await assert.rejects(assertFreshTarget(root, profile, name))
    }
    await assertFreshTarget({ async query() { return [[]] } }, profile, profile.database + '_restore_123456abcdef')
})
