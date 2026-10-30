// Read-only diagnosis of the approved account-12 operation; never replays DML.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { artifact } = require('./local-inova-reset-password')
const { staticConnection, SOURCE, TARGET } = require('./local-mysql-copy')
const { decryptDetails } = require('./isolated-inventory')
const { verifyPublished } = require('./local-inova-preview')
async function main() {
    const directory = fs.realpathSync(process.argv[2])
    assert.equal(directory.toLowerCase(), path.resolve(process.env.LOCALAPPDATA, 'EvaluationDev/inova-nucleo-compat-20261029').toLowerCase())
    const profile = JSON.parse(fs.readFileSync(path.join(directory, 'profile.json'), 'utf8').replace(/^\uFEFF/, ''))
    const config = staticConnection(fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')), secret = process.env.EVAL_LOCAL_COPY_INVENTORY_SECRET
    await verifyPublished(directory, profile, config, secret)
    const identity = profile.id + ':' + SOURCE + ':' + TARGET + ':' + artifact
    const saved = decryptDetails(JSON.parse(fs.readFileSync(path.join(directory, artifact + '-before.evalinventory'), 'utf8')), secret, identity, profile.id)
    const db = require('knex')({ client: 'mysql', connection: { ...config, database: TARGET, dateStrings: true, timezone: 'Z' },
        log: { warn() {}, error() {}, debug() {}, deprecate() {} } })
    try {
        const rows = await db('users2').orderBy('id'), normalized = JSON.parse(JSON.stringify(rows))
        const allIdentical = JSON.stringify(normalized) === JSON.stringify(saved.accounts)
        const fields = new Set()
        const changedAccountIds = new Set()
        for (const row of normalized) {
            const before = saved.accounts.find(item => item.id === row.id)
            if (!before) { fields.add('account-count'); continue }
            for (const key of Object.keys(row)) if (JSON.stringify(row[key]) !== JSON.stringify(before[key])) { fields.add(key); changedAccountIds.add(row.id) }
        }
        console.log(JSON.stringify({ success: true, readOnly: true, allAccountFieldsStillEqualEncryptedBackup: allIdentical,
            accountCount: rows.length, driverRowPrototypeDiffersFromJson: Object.getPrototypeOf(rows[0]) !== Object.getPrototypeOf(normalized[0]),
            onlyChosenAccountChanged: changedAccountIds.size === 1 && changedAccountIds.has(12),
            changedFieldNames: [...fields], reportExists: fs.existsSync(path.join(directory, artifact + '-report.json')) }))
    } finally { await db.destroy() }
}
main().catch(() => { console.log(JSON.stringify({ success: false, sensitiveDiagnosticsSuppressed: true })); process.exitCode = 1 })
