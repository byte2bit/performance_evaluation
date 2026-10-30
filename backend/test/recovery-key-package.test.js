const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const argon2 = require('argon2')
const { seal, unseal } = require('../scripts/isolated-recovery')
const api = require('../lib/recovery/key-package')

const source = Object.freeze({ profileId: '0123456789abcdef0123456789abcdef', database: 'evaluation_synthetic_fixture' })
const phrase = 'frase sintética exclusiva para os testes'
const bytes = value => Buffer.from(JSON.stringify(value), 'utf8')
const changedHex = value => (value[0] === '0' ? '1' : '0') + value.slice(1)
const invalid = error => error.code === api.ERROR_CODE && error.message === 'Pacote inválido ou frase-senha incorreta.' && !error.cause
const record = value => Object.assign(Object.create(null), value)

function fixture(t) {
    const recoveryKey = crypto.randomBytes(32)
    const sql = Buffer.from("-- synthetic SQL, never executed\nSELECT 'fictitious';", 'utf8')
    const backupBytes = bytes(seal(sql, recoveryKey, `${source.profileId}:${source.database}`))
    t.after(() => { recoveryKey.fill(0); sql.fill(0); backupBytes.fill(0) })
    return { recoveryKey, sql, backupBytes, source, passphrase: phrase }
}
const wrappingInput = f => ({ recoveryKey: f.recoveryKey, source: f.source, passphrase: f.passphrase, backupBytes: f.backupBytes })
const unlockingInput = (f, packageBytes) => ({ packageBytes, source: f.source, passphrase: f.passphrase, backupBytes: f.backupBytes })

// Load the actual module with an explicit import allowlist, no process/console,
// and optional spies. Test fixtures enter through null-prototype data records.
function isolated({ hash = (...args) => argon2.hash(...args), cryptoModule = crypto } = {}) {
    const module = { exports: {} }, imports = []
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/recovery/key-package.js'), 'utf8'), {
        module, Buffer,
        require(name) {
            imports.push(name)
            if (name === 'node:crypto') return cryptoModule
            if (name === 'node:buffer') return require('node:buffer')
            if (name === 'argon2') return { argon2id: argon2.argon2id, hash }
            assert.fail('Operational import forbidden in the in-memory prototype')
        }
    }, { timeout: 1000 })
    return { api: module.exports, imports }
}
const isolatedInput = input => record({ ...input, source: record(input.source) })

test('synthetic key round-trip opens the existing backup without changing its format or caller-owned buffers', async t => {
    const f = fixture(t), keyBefore = Buffer.from(f.recoveryKey), backupBefore = Buffer.from(f.backupBytes)
    const packageBytes = await api.wrapKey(wrappingInput(f))
    const key = await api.unwrapKey(unlockingInput(f, packageBytes))
    const plain = await api.openBackup(unlockingInput(f, packageBytes))
    try {
        assert.deepEqual(key, f.recoveryKey)
        assert.deepEqual(unseal(JSON.parse(f.backupBytes), key, `${source.profileId}:${source.database}`), f.sql)
        assert.deepEqual(plain, f.sql)
        assert.deepEqual(f.recoveryKey, keyBefore)
        assert.deepEqual(f.backupBytes, backupBefore)
        assert.ok(packageBytes.length < api.MAX_PACKAGE_BYTES)
        assert.equal(JSON.parse(f.backupBytes).format, 'evaluation-backup-v1')
    } finally { key.fill(0); plain.fill(0); keyBefore.fill(0); backupBefore.fill(0) }
})

test('a package contains only authenticated metadata and encrypted key material, with fresh salt, nonce and key ID', async t => {
    const f = fixture(t)
    const one = await api.wrapKey(wrappingInput(f)), two = await api.wrapKey(wrappingInput(f))
    const first = JSON.parse(one), second = JSON.parse(two)
    assert.equal(first.format, api.FORMAT)
    assert.equal(first.data.length, 64)
    assert.notEqual(first.keyId, second.keyId)
    assert.notEqual(first.iv, second.iv)
    assert.notEqual(first.kdf.salt, second.kdf.salt)
    assert.notEqual(first.data, second.data)
    assert.equal(one.includes(f.recoveryKey), false)
    assert.equal(one.toString().includes(f.recoveryKey.toString('hex')), false)
    assert.equal(one.toString().includes(phrase), false)
    assert.equal(one.toString().includes(f.sql.toString()), false)
})

test('wrong passphrases and valid-length tampering of ciphertext, tag, nonce, salt and key ID never yield a key', async t => {
    const f = fixture(t), packageBytes = await api.wrapKey(wrappingInput(f))
    await assert.rejects(api.unwrapKey({ ...unlockingInput(f, packageBytes), passphrase: 'outra frase sintética que está errada' }), invalid)
    for (const field of ['data', 'tag', 'iv', 'keyId', 'salt']) {
        const envelope = JSON.parse(packageBytes)
        if (field === 'salt') envelope.kdf.salt = changedHex(envelope.kdf.salt)
        else envelope[field] = changedHex(envelope[field])
        await assert.rejects(api.unwrapKey(unlockingInput(f, bytes(envelope))), invalid)
    }
})

test('changing both the backup bytes and its claimed hash still fails authenticated package metadata', async t => {
    const f = fixture(t), packageBytes = await api.wrapKey(wrappingInput(f))
    const alteredBackup = Buffer.concat([f.backupBytes, Buffer.from('\n')])
    const envelope = JSON.parse(packageBytes)
    envelope.backupSha256 = crypto.createHash('sha256').update(alteredBackup).digest('hex')
    await assert.rejects(api.openBackup({ ...unlockingInput(f, bytes(envelope)), backupBytes: alteredBackup }), invalid)
})

test('packaging refuses wrong recovery keys and corrupted backup authentication before KDF work', async t => {
    const f = fixture(t)
    let derivations = 0
    const isolatedApi = isolated({ hash() { derivations++; assert.fail('No KDF for a key/backup mismatch') } }).api
    await assert.rejects(isolatedApi.wrapKey(isolatedInput({ ...wrappingInput(f), recoveryKey: crypto.randomBytes(32) })), invalid)
    for (const field of ['tag', 'iv']) {
        const envelope = JSON.parse(f.backupBytes); envelope[field] = changedHex(envelope[field])
        await assert.rejects(isolatedApi.wrapKey(isolatedInput({ ...wrappingInput(f), backupBytes: bytes(envelope) })), invalid)
    }
    assert.equal(derivations, 0)
})

test('source and exact backup identity cannot be substituted before unlocking', async t => {
    const f = fixture(t), packageBytes = await api.wrapKey(wrappingInput(f))
    const other = bytes(seal(f.sql, f.recoveryKey, `${source.profileId}:${source.database}`))
    await assert.rejects(api.unwrapKey({ ...unlockingInput(f, packageBytes), backupBytes: other }), invalid)
    for (const changedSource of [{ ...source, profileId: 'f'.repeat(32) }, { ...source, database: 'another_fixture' }]) {
        await assert.rejects(api.unwrapKey({ ...unlockingInput(f, packageBytes), source: changedSource }), invalid)
    }
})

test('unsupported fields, algorithms, costs and encodings are rejected before any Argon2 work', async t => {
    const f = fixture(t), packageBytes = await api.wrapKey(wrappingInput(f))
    let derivations = 0
    const isolatedApi = isolated({ hash() { derivations++; assert.fail('Untrusted parameters must not reach Argon2') } }).api
    const mutations = [
        envelope => { envelope.format = 'unsupported-v2' },
        envelope => { envelope.cipher = 'aes-256-cbc' },
        envelope => { envelope.keyId = 'A'.repeat(32) },
        envelope => { envelope.tag = '00' },
        envelope => { envelope.data = '00'.repeat(31) },
        envelope => { envelope.backupSha256 = 'x'.repeat(64) },
        envelope => { envelope.kdf.memoryCost = 2 ** 32 },
        envelope => { envelope.kdf.timeCost = 1 },
        envelope => { envelope.kdf.parallelism = 100 },
        envelope => { envelope.kdf.hashLength = 64 },
        envelope => { envelope.kdf.version = 16 },
        envelope => { envelope.kdf.name = 'argon2d' },
        envelope => { envelope.kdf.salt = 'zz'.repeat(16) },
        envelope => { envelope.kdf.secret = 'forbidden extra field' },
        envelope => { envelope.source.extra = 'forbidden' },
        envelope => { envelope.SESSION_SECRET = 'synthetic extra secret' },
        envelope => { envelope.__proto__ = { unexpected: true }; envelope.unexpected = true },
    ]
    for (const mutate of mutations) {
        const envelope = JSON.parse(packageBytes); mutate(envelope)
        await assert.rejects(isolatedApi.unwrapKey(isolatedInput(unlockingInput(f, bytes(envelope)))), invalid)
    }
    assert.equal(derivations, 0)
})

test('size, input type, JSON and UTF-8 limits fail before key derivation', async t => {
    const f = fixture(t), packageBytes = await api.wrapKey(wrappingInput(f))
    let derivations = 0
    const isolatedApi = isolated({ hash() { derivations++; assert.fail('Malformed input must fail before KDF') } }).api
    for (const value of [null, 'not a Buffer', Buffer.alloc(0), Buffer.alloc(api.MAX_PACKAGE_BYTES + 1),
        Buffer.from('{'), Buffer.from('[]'), Buffer.from([0xff]), Buffer.from('null')]) {
        await assert.rejects(isolatedApi.unwrapKey(isolatedInput({ ...unlockingInput(f, packageBytes), packageBytes: value })), invalid)
    }
    const oversized = Buffer.alloc(api.MAX_BACKUP_BYTES + 1)
    await assert.rejects(isolatedApi.unwrapKey(isolatedInput({ ...unlockingInput(f, packageBytes), backupBytes: oversized })), invalid)
    await assert.rejects(isolatedApi.wrapKey(isolatedInput({ ...wrappingInput(f), recoveryKey: Buffer.alloc(31) })), invalid)
    assert.equal(derivations, 0)
})

test('the backup parser rejects unknown fields, wrong lengths and noncanonical base64 without KDF', async t => {
    const f = fixture(t)
    let derivations = 0
    const isolatedApi = isolated({ hash() { derivations++; assert.fail('Invalid backup must fail before KDF') } }).api
    for (const change of [{ format: 'unsupported' }, { identity: 'another-source' }, { iv: '00' }, { tag: 'aa' },
        { data: 'YQ' }, { data: 'YQ--' }, { data: 'YR==' }, { extra: 'not allowed' }]) {
        const backup = { ...JSON.parse(f.backupBytes), ...change }
        await assert.rejects(isolatedApi.wrapKey(isolatedInput({ ...wrappingInput(f), backupBytes: bytes(backup) })), invalid)
    }
    assert.equal(derivations, 0)
})

test('passphrase policy rejects weak, oversized and malformed Unicode input before KDF', async t => {
    const f = fixture(t)
    let derivations = 0
    const isolatedApi = isolated({ hash() { derivations++; assert.fail('Invalid passphrase must fail before KDF') } }).api
    for (const value of [null, 123, Buffer.from(phrase), '', 'x'.repeat(19), ' '.repeat(20), 'x'.repeat(257), '\ud800'.repeat(20), '😀'.repeat(257)]) {
        await assert.rejects(isolatedApi.wrapKey(isolatedInput({ ...wrappingInput(f), passphrase: value })), invalid)
    }
    assert.equal(derivations, 0)
})

test('Unicode passphrases round-trip at the upper limit without trimming or silent normalization', async t => {
    const f = fixture(t)
    const maximum = { ...f, passphrase: '😀'.repeat(256) }
    const maxPackage = await api.wrapKey(wrappingInput(maximum))
    const maxKey = await api.unwrapKey(unlockingInput(maximum, maxPackage))
    assert.deepEqual(maxKey, f.recoveryKey); maxKey.fill(0)
    const composed = { ...f, passphrase: 'é'.repeat(20) }
    const encoded = await api.wrapKey(wrappingInput(composed))
    await assert.rejects(api.unwrapKey({ ...unlockingInput(composed, encoded), passphrase: 'e\u0301'.repeat(20) }), invalid)
    const spaces = { ...f, passphrase: ' ' + phrase + ' ' }
    const paddedPackage = await api.wrapKey(wrappingInput(spaces))
    await assert.rejects(api.unwrapKey(unlockingInput(f, paddedPackage)), invalid)
})

test('canonical authenticated header is independent of JSON property order', async t => {
    const f = fixture(t), packageBytes = await api.wrapKey(wrappingInput(f)), envelope = JSON.parse(packageBytes)
    envelope.kdf = Object.fromEntries(Object.entries(envelope.kdf).reverse())
    envelope.source = Object.fromEntries(Object.entries(envelope.source).reverse())
    const reordered = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(envelope).reverse()), null, 2))
    const key = await api.unwrapKey(unlockingInput(f, reordered))
    assert.deepEqual(key, f.recoveryKey); key.fill(0)
})

test('internal wrapping keys, password copies and unauthenticated plaintext are cleared on success and failure', async t => {
    const f = fixture(t), packageBytes = await api.wrapKey(wrappingInput(f))
    const passwords = [], derivedKeys = [], partials = []
    const isolatedApi = isolated({
        async hash(password, options) {
            assert.equal(options.type, argon2.argon2id)
            assert.equal(options.version, 19)
            assert.equal(options.memoryCost, 65536)
            assert.equal(options.timeCost, 3)
            assert.equal(options.parallelism, 1)
            assert.equal(options.hashLength, 32)
            assert.equal(options.raw, true)
            passwords.push(password)
            const key = await argon2.hash(password, options)
            derivedKeys.push(key); return key
        },
        cryptoModule: { ...crypto, createDecipheriv(...args) {
            const decipher = crypto.createDecipheriv(...args), update = decipher.update.bind(decipher)
            decipher.update = (...values) => { const partial = update(...values); partials.push(partial); return partial }
            return decipher
        } }
    }).api
    const returned = await isolatedApi.unwrapKey(isolatedInput(unlockingInput(f, packageBytes)))
    assert.deepEqual(returned, f.recoveryKey)
    const altered = JSON.parse(packageBytes); altered.tag = changedHex(altered.tag)
    await assert.rejects(isolatedApi.unwrapKey(isolatedInput(unlockingInput(f, bytes(altered)))), invalid)
    assert.ok(passwords.length === 2 && derivedKeys.length === 2 && partials.length >= 3)
    for (const buffer of [...passwords, ...derivedKeys, ...partials]) assert.ok(buffer.every(byte => byte === 0))
    assert.deepEqual(returned, f.recoveryKey, 'Caller-owned result must remain usable until the caller clears it')
    returned.fill(0)
})

test('input buffers and metadata are snapshotted before awaiting Argon2', async t => {
    const f = fixture(t), original = Buffer.from(f.recoveryKey), originalBackup = Buffer.from(f.backupBytes)
    let entered, release
    const ready = new Promise(resolve => { entered = resolve }), gate = new Promise(resolve => { release = resolve })
    const isolatedApi = isolated({ async hash(password, options) { entered(); await gate; return argon2.hash(password, options) } }).api
    const mutableSource = record(source)
    const input = record({ ...wrappingInput(f), source: mutableSource })
    const pending = isolatedApi.wrapKey(input)
    await ready
    f.recoveryKey.fill(0); f.backupBytes.fill(0); mutableSource.database = 'changed_during_kdf'
    input.passphrase = 'outra frase alterada durante a derivação'
    release()
    const packageBytes = await pending
    const key = await api.unwrapKey({ ...unlockingInput(f, packageBytes), backupBytes: originalBackup })
    assert.deepEqual(key, original)
    key.fill(0); original.fill(0); originalBackup.fill(0)
})

test('unlocking snapshots both encoded inputs and expected origin before awaiting Argon2', async t => {
    const f = fixture(t), packageBytes = await api.wrapKey(wrappingInput(f))
    let entered, release
    const ready = new Promise(resolve => { entered = resolve }), gate = new Promise(resolve => { release = resolve })
    const isolatedApi = isolated({ async hash(password, options) { entered(); await gate; return argon2.hash(password, options) } }).api
    const mutableSource = record(source)
    const input = record({ ...unlockingInput(f, packageBytes), source: mutableSource })
    const pending = isolatedApi.openBackup(input)
    await ready
    packageBytes.fill(0); f.backupBytes.fill(0); mutableSource.profileId = 'f'.repeat(32)
    input.passphrase = 'outra frase alterada durante a derivação'
    release()
    const sql = await pending
    assert.deepEqual(sql, f.sql); sql.fill(0)
})

test('even a valid authenticated package cannot return a wrong key or SQL from a backup it cannot authenticate', async t => {
    const f = fixture(t), envelope = JSON.parse(await api.wrapKey(wrappingInput(f)))
    const password = Buffer.from(phrase), wrongKey = crypto.randomBytes(32)
    let wrappingKey
    try {
        // Independent consumer of the documented format; deliberately wrap a
        // wrong synthetic recovery key with a valid package authentication tag.
        wrappingKey = await argon2.hash(password, { type: argon2.argon2id, version: 19, memoryCost: 65536,
            timeCost: 3, parallelism: 1, hashLength: 32, raw: true, salt: Buffer.from(envelope.kdf.salt, 'hex') })
        envelope.iv = crypto.randomBytes(12).toString('hex')
        const aad = { format: envelope.format, cipher: envelope.cipher, keyId: envelope.keyId, source: envelope.source,
            backupSha256: envelope.backupSha256, kdf: envelope.kdf, iv: envelope.iv }
        const cipher = crypto.createCipheriv('aes-256-gcm', wrappingKey, Buffer.from(envelope.iv, 'hex'), { authTagLength: 16 })
        cipher.setAAD(bytes(aad))
        envelope.data = Buffer.concat([cipher.update(wrongKey), cipher.final()]).toString('hex')
        envelope.tag = cipher.getAuthTag().toString('hex')
        for (const unlock of [api.unwrapKey, api.openBackup]) await assert.rejects(unlock(unlockingInput(f, bytes(envelope))), invalid)
    } finally { wrappingKey?.fill(0); password.fill(0); wrongKey.fill(0) }
})

test('prototype has no operational imports or console/process access and sanitizes library failures', async t => {
    const f = fixture(t)
    const { api: isolatedApi, imports } = isolated({ async hash() { throw new Error('synthetic internal secret diagnostic') } })
    assert.deepEqual(imports, ['node:crypto', 'node:buffer', 'argon2'])
    await assert.rejects(isolatedApi.wrapKey(isolatedInput(wrappingInput(f))), invalid)
    let getterCalled = false
    const input = isolatedInput(wrappingInput(f))
    Object.defineProperty(input, 'passphrase', { enumerable: true, get() { getterCalled = true; return phrase } })
    await assert.rejects(isolatedApi.wrapKey(input), invalid)
    assert.equal(getterCalled, false)
})
