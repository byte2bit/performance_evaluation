const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { database } = require('./helpers/auth-harness')
const { createPasswords } = require('../lib/auth/passwords')
const { resetAccount, confirmation } = require('../scripts/local-inova-reset-password')

const password = 'synthetic-reset-password-only-for-tests'
function fixture() {
    const fixture = database()
    fixture.state.tables.users2[0].id = 12
    // The in-memory harness keeps JS booleans; MySQL reads TINYINT as 1.
    fixture.state.tables.users2[0].active = true
    return fixture
}
test('local reset archives first and changes only password/version of account 12, preserving all other accounts', async () => {
    const { db, state } = fixture(), before = structuredClone(state.tables), passwords = createPasswords()
    let archived
    const result = await resetAccount({ db, password, passwords, archive: async accounts => {
        assert.equal(state.writes.length, 0)
        archived = structuredClone(accounts)
    } })
    assert.deepEqual(archived, before.users2)
    assert.equal(result.otherAccountsPreserved, before.users2.length - 1)
    assert.equal(result.email, 'admin@example.invalid')
    const actual = state.tables.users2[0]
    assert.match(actual.password, /^\$argon2id\$/)
    assert.equal(await passwords.verify(actual.password, password), true)
    before.users2[0].password = actual.password; before.users2[0].session_version++
    assert.deepEqual(state.tables, before)
    assert.deepEqual(state.writes, [{ table: 'users2', action: 'update' }])
})
test('MySQL RowDataPacket prototypes do not prevent authenticated JSON backup comparison', async () => {
    const { db, state } = fixture()
    const driverDb = { transaction: callback => db.transaction(trx => {
        const driverTrx = table => {
            const query = trx(table), then = query.then
            query.then = (resolve, reject) => then.call(query, rows => resolve(rows.map(row => Object.assign(Object.create({ syntheticDriver: true }), row))), reject)
            return query
        }
        driverTrx.raw = trx.raw
        return callback(driverTrx)
    }) }
    await resetAccount({ db: driverDb, password, archive: rows => assert.deepEqual(JSON.parse(JSON.stringify(rows)), rows) })
    assert.equal(state.tables.users2[0].session_version, 1)
})
test('failed encrypted archive leaves the account and all data unchanged', async () => {
    const { db, state } = fixture(), before = structuredClone(state.tables)
    await assert.rejects(resetAccount({ db, password, archive: () => { throw new Error('synthetic archive failure') } }), /archive failure/)
    assert.deepEqual(state.tables, before); assert.equal(state.writes.length, 0)
})
test('inactive, deleted, nonadministrator, missing and exhausted-version targets refuse the reset', async () => {
    for (const change of [{ active: 0 }, { deletedAt: 'synthetic' }, { admin: 0 }, { id: 99 }, { session_version: 4294967295 }]) {
        const { db, state } = fixture(); Object.assign(state.tables.users2[0], change)
        const before = structuredClone(state.tables)
        await assert.rejects(resetAccount({ db, password, archive: () => assert.fail('archive must not run') }), { code: 'RESET_ACCOUNT_REFUSED' })
        assert.deepEqual(state.tables, before); assert.equal(state.writes.length, 0)
    }
})
test('invalid hash service rolls back a reset instead of committing unverifiable credentials', async () => {
    const { db, state } = fixture(), before = structuredClone(state.tables)
    await assert.rejects(resetAccount({ db, password, archive() {}, passwords: { async hash() { return 'invalid-synthetic-hash' }, async verify() { return true } } }), { code: 'RESET_HASH_VERIFICATION_FAILED' })
    assert.deepEqual(state.tables, before); assert.equal(state.writes.length, 0)
})
test('invalid password and missing explicit scope refuse before archive or filesystem/database work', async () => {
    const { db, state } = fixture()
    await assert.rejects(resetAccount({ db, password: 'short', archive: () => assert.fail('archive must not run') }), { code: 'RESET_INPUT_REFUSED' })
    assert.equal(state.queries.length, 0)
    for (const approved of ['wrong-target', undefined]) {
        const result = spawnSync(process.execPath, [require.resolve('../scripts/local-inova-reset-password'), 'missing-directory', ...(approved ? [approved] : [])], { encoding: 'utf8' })
        assert.equal(result.status, 1)
        assert.deepEqual(JSON.parse(result.stdout), { success: false, resetCommitted: false, sensitiveDiagnosticsSuppressed: true })
        assert.equal(result.stderr, '')
    }
    assert.equal(confirmation, 'inova_nucleo_compat_20261029:reset-account12:20261030')
})
