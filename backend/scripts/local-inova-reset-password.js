// One approved reset: account 12 in the prepared fictitious local copy only.
// Invoked by the PowerShell wrapper; stdin/stdout are private captured pipes.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { createAccounts } = require('../lib/auth/accounts')
const { createPasswords, validPassword } = require('../lib/auth/passwords')
const { active, isAdmin } = require('../lib/auth/identity')
const { verifyPublished, validPersistedHash } = require('./local-inova-preview')
const { staticConnection, SOURCE, TARGET } = require('./local-mysql-copy')
const { encryptDetails, decryptDetails } = require('./isolated-inventory')
const { ensure } = require('./local-access-guard')

const confirmation = TARGET + ':reset-account12:20261030'
const artifact = 'password-reset-account12-20261030'

async function resetAccount({ db, password, archive, passwords = createPasswords() }) {
    ensure(validPassword(password) && typeof archive === 'function', 'RESET_INPUT_REFUSED')
    return db.transaction(async trx => {
        // mysql's RowDataPacket has a driver prototype; the encrypted JSON
        // backup stores plain data. Compare every value in a common format.
        const before = JSON.parse(JSON.stringify(await trx('users2').orderBy('id').forUpdate()))
        const account = before.find(row => row.id === 12)
        ensure(account && active(account) && isAdmin(account) && Number.isSafeInteger(account.session_version) &&
            account.session_version >= 0 && account.session_version < 4294967295, 'RESET_ACCOUNT_REFUSED')
        await archive(before)
        // Reuse the existing account service inside this already-open transaction.
        await createAccounts({ transaction: callback => callback(trx) }, passwords).change(12, 'activate', password)
        const after = JSON.parse(JSON.stringify(await trx('users2').orderBy('id')))
        const updated = after.find(row => row.id === 12)
        ensure(updated && updated.password !== account.password && validPersistedHash(updated.password) &&
            await passwords.verify(updated.password, password), 'RESET_HASH_VERIFICATION_FAILED')
        const expected = before.map(row => row.id === 12 ? { ...row, password: updated.password, session_version: row.session_version + 1 } : row)
        assert.deepEqual(after, expected)
        return { email: account.email, accountsVerified: before.length, otherAccountsPreserved: before.length - 1 }
    })
}

async function main() {
    const [directoryArg, approved, recovery, ...extra] = process.argv.slice(2)
    ensure(!extra.length && approved === confirmation && (recovery === undefined || recovery === 'resume-prepared'), 'RESET_CONFIRMATION_REQUIRED')
    const resume = recovery === 'resume-prepared'
    const directory = fs.realpathSync(directoryArg)
    ensure(directory.toLowerCase() === path.resolve(process.env.LOCALAPPDATA || '', 'EvaluationDev/inova-nucleo-compat-20261029').toLowerCase(), 'RESET_DIRECTORY_REFUSED')
    const backup = path.join(directory, artifact + '-before.evalinventory'), reportFile = path.join(directory, artifact + '-report.json')
    ensure(fs.existsSync(backup) === resume && !fs.existsSync(reportFile), 'RESET_REPLAY_REFUSED')
    const profile = JSON.parse(fs.readFileSync(path.join(directory, 'profile.json'), 'utf8').replace(/^\uFEFF/, ''))
    const config = staticConnection(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8'))
    const secret = process.env.EVAL_LOCAL_COPY_INVENTORY_SECRET
    await verifyPublished(directory, profile, config, secret)
    let input = ''
    for await (const chunk of process.stdin) { input += chunk; ensure(Buffer.byteLength(input) <= 1024, 'RESET_INPUT_TOO_LARGE') }
    const request = JSON.parse(input); input = ''
    ensure(Object.keys(request).length === 1 && validPassword(request.password), 'RESET_INPUT_REFUSED')
    const db = require('knex')({ client: 'mysql', connection: { ...config, database: TARGET, dateStrings: true, timezone: 'Z' },
        pool: { min: 0, max: 1 }, log: { warn() {}, error() {}, debug() {}, deprecate() {} } })
    let committed = false
    try {
        await db.raw('SET SESSION innodb_lock_wait_timeout=5')
        const result = await resetAccount({ db, password: request.password, archive: async accounts => {
            const identity = profile.id + ':' + SOURCE + ':' + TARGET + ':' + artifact
            if (resume) {
                const saved = decryptDetails(JSON.parse(fs.readFileSync(backup, 'utf8')), secret, identity, profile.id)
                ensure(saved.target === TARGET && saved.accountId === 12 && saved.serverUuid === profile.serverUuid, 'RESET_BACKUP_IDENTITY_REFUSED')
                assert.deepEqual(saved.accounts, accounts)
                return
            }
            const details = { target: TARGET, accountId: 12, serverUuid: profile.serverUuid, accounts, capturedUtc: new Date().toISOString() }
            fs.writeFileSync(backup, JSON.stringify(encryptDetails(details, secret, identity, profile.id)), { flag: 'wx', mode: 0o600 })
            assert.deepEqual(decryptDetails(JSON.parse(fs.readFileSync(backup, 'utf8')), secret, identity, profile.id), details)
        } })
        committed = true
        const report = { success: true, target: TARGET, accountId: 12, accountsVerified: result.accountsVerified,
            otherAccountsPreserved: result.otherAccountsPreserved, passwordHash: 'Argon2id', sessionVersionIncremented: true,
            profileAndIdentityPreserved: true, encryptedAccountBackupAuthenticated: true, sourceNotWritten: true,
            resumedPreparedAfterVerifiedRollback: resume, operationalLoginsAttempted: 0, completedUtc: new Date().toISOString() }
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })
        // Captured by the wrapper into the DPAPI delivery vault, never forwarded
        // to a terminal, tool output, log or repository artifact.
        process.stdout.write(JSON.stringify({ ...report, email: result.email }))
    } catch (error) {
        error.resetCommitted = committed
        throw error
    } finally { request.password = undefined; await db.destroy() }
}
if (require.main === module) main().catch(error => {
    process.stdout.write(JSON.stringify({ success: false, resetCommitted: Boolean(error.resetCommitted), sensitiveDiagnosticsSuppressed: true }))
    process.exitCode = 1
})
module.exports = { resetAccount, confirmation, artifact }
