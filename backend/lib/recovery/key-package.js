// In-memory prototype only. No operational vault, filesystem, environment,
// database, application bootstrap or service access. Returned secret buffers
// belong to the caller and must be cleared after use.
const { randomBytes, createHash, createCipheriv, createDecipheriv, timingSafeEqual } = require('node:crypto')
const { isUtf8 } = require('node:buffer')
const argon2 = require('argon2')

const FORMAT = 'evaluation-recovery-key-v1'
const MAX_PACKAGE_BYTES = 4096
// Existing dumps are bounded at 32 MiB before their base64/JSON envelope.
const MAX_BACKUP_BYTES = 64 * 1024 * 1024
const ERROR_CODE = 'RECOVERY_KEY_PACKAGE_INVALID'
const invalid = () => Object.assign(new Error('Pacote inválido ou frase-senha incorreta.'), { code: ERROR_CODE })
const requireValid = condition => { if (!condition) throw invalid() }
const hex = (value, bytes) => typeof value === 'string' && value.length === bytes * 2 && /^[a-f0-9]+$/.test(value)

function exactFields(value, names) {
    requireValid(value !== null && typeof value === 'object' &&
        [Object.prototype, null].includes(Object.getPrototypeOf(value)))
    requireValid(Reflect.ownKeys(value).length === names.length)
    for (const name of names) {
        const descriptor = Object.getOwnPropertyDescriptor(value, name)
        requireValid(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable)
    }
}

function sourceIdentity(source) {
    exactFields(source, ['profileId', 'database'])
    requireValid(hex(source.profileId, 16))
    requireValid(typeof source.database === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(source.database))
    return { profileId: source.profileId, database: source.database }
}

function copyBytes(value, maximum) {
    requireValid(Buffer.isBuffer(value) && value.length > 0 && value.length <= maximum)
    return Buffer.from(value)
}

function passphraseBytes(value) {
    requireValid(typeof value === 'string' && value.length <= 512 && value.isWellFormed())
    const length = [...value].length
    requireValid(length >= 20 && length <= 256 && value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= 1024)
    return Buffer.from(value, 'utf8')
}

function parseJson(bytes) {
    requireValid(isUtf8(bytes))
    return JSON.parse(bytes.toString('utf8'))
}

function backupEnvelope(bytes, source) {
    const envelope = parseJson(bytes)
    exactFields(envelope, ['format', 'identity', 'iv', 'tag', 'data'])
    requireValid(envelope.format === 'evaluation-backup-v1' && envelope.identity === `${source.profileId}:${source.database}`)
    requireValid(hex(envelope.iv, 12) && hex(envelope.tag, 16))
    requireValid(typeof envelope.data === 'string' && envelope.data.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(envelope.data))
    // Buffer's base64 decoder is permissive; require canonical encoding.
    const ciphertext = Buffer.from(envelope.data, 'base64')
    try { requireValid(ciphertext.toString('base64') === envelope.data) }
    finally { ciphertext.fill(0) }
    return envelope
}

function header(envelope) {
    // Fixed field order authenticates the semantic metadata independently of
    // the JSON file's property order or whitespace.
    return { format: envelope.format, cipher: envelope.cipher, keyId: envelope.keyId,
        source: { profileId: envelope.source.profileId, database: envelope.source.database },
        backupSha256: envelope.backupSha256,
        kdf: { name: envelope.kdf.name, version: envelope.kdf.version, memoryCost: envelope.kdf.memoryCost,
            timeCost: envelope.kdf.timeCost, parallelism: envelope.kdf.parallelism, hashLength: envelope.kdf.hashLength,
            salt: envelope.kdf.salt }, iv: envelope.iv }
}

function packageEnvelope(bytes, source, backupBytes) {
    const envelope = parseJson(bytes)
    exactFields(envelope, ['format', 'cipher', 'keyId', 'source', 'backupSha256', 'kdf', 'iv', 'tag', 'data'])
    requireValid(envelope.format === FORMAT && envelope.cipher === 'aes-256-gcm' && hex(envelope.keyId, 16))
    const actualSource = sourceIdentity(envelope.source)
    requireValid(actualSource.profileId === source.profileId && actualSource.database === source.database)
    requireValid(hex(envelope.backupSha256, 32) && hex(envelope.iv, 12) && hex(envelope.tag, 16) && hex(envelope.data, 32))
    exactFields(envelope.kdf, ['name', 'version', 'memoryCost', 'timeCost', 'parallelism', 'hashLength', 'salt'])
    requireValid(envelope.kdf.name === 'argon2id' && envelope.kdf.version === 19 && envelope.kdf.memoryCost === 65536 &&
        envelope.kdf.timeCost === 3 && envelope.kdf.parallelism === 1 && envelope.kdf.hashLength === 32 && hex(envelope.kdf.salt, 16))
    requireValid(timingSafeEqual(Buffer.from(envelope.backupSha256, 'hex'), createHash('sha256').update(backupBytes).digest()))
    return envelope
}

async function derive(passphrase, kdf) {
    return argon2.hash(passphrase, { type: argon2.argon2id, version: 19, memoryCost: 65536, timeCost: 3,
        parallelism: 1, hashLength: 32, raw: true, salt: Buffer.from(kdf.salt, 'hex') })
}

function decrypt(ciphertext, key, iv, tag, aad) {
    let partial, final
    try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
        decipher.setAAD(aad)
        decipher.setAuthTag(tag)
        partial = decipher.update(ciphertext)
        final = decipher.final()
        return Buffer.concat([partial, final])
    } finally {
        // update() may contain unauthenticated plaintext if final() fails.
        partial?.fill(0)
        final?.fill(0)
    }
}

function decryptBackup(envelope, key) {
    return decrypt(Buffer.from(envelope.data, 'base64'), key, Buffer.from(envelope.iv, 'hex'),
        Buffer.from(envelope.tag, 'hex'), Buffer.from(envelope.identity, 'utf8'))
}

async function wrapKey(input) {
    let key, password, backupBytes, wrappingKey, plaintext
    try {
        exactFields(input, ['recoveryKey', 'passphrase', 'source', 'backupBytes'])
        const source = sourceIdentity(input.source)
        requireValid(Buffer.isBuffer(input.recoveryKey) && input.recoveryKey.length === 32)
        key = Buffer.from(input.recoveryKey)
        password = passphraseBytes(input.passphrase)
        backupBytes = copyBytes(input.backupBytes, MAX_BACKUP_BYTES)
        const backup = backupEnvelope(backupBytes, source)
        // A package for a key that cannot open this backup is not a valid export.
        plaintext = decryptBackup(backup, key)
        plaintext.fill(0); plaintext = null
        const metadata = { format: FORMAT, cipher: 'aes-256-gcm', keyId: randomBytes(16).toString('hex'), source,
            backupSha256: createHash('sha256').update(backupBytes).digest('hex'),
            kdf: { name: 'argon2id', version: 19, memoryCost: 65536, timeCost: 3, parallelism: 1,
                hashLength: 32, salt: randomBytes(16).toString('hex') }, iv: randomBytes(12).toString('hex') }
        wrappingKey = await derive(password, metadata.kdf)
        const cipher = createCipheriv('aes-256-gcm', wrappingKey, Buffer.from(metadata.iv, 'hex'), { authTagLength: 16 })
        cipher.setAAD(Buffer.from(JSON.stringify(header(metadata)), 'utf8'))
        const ciphertext = Buffer.concat([cipher.update(key), cipher.final()])
        const encoded = Buffer.from(JSON.stringify({ ...header(metadata), tag: cipher.getAuthTag().toString('hex'), data: ciphertext.toString('hex') }), 'utf8')
        requireValid(encoded.length <= MAX_PACKAGE_BYTES)
        return encoded
    } catch { throw invalid() }
    finally {
        key?.fill(0); password?.fill(0); backupBytes?.fill(0); wrappingKey?.fill(0); plaintext?.fill(0)
    }
}

async function unlock(input, returnBackup) {
    let packageBytes, backupBytes, password, wrappingKey, key, plaintext
    try {
        exactFields(input, ['packageBytes', 'passphrase', 'source', 'backupBytes'])
        const source = sourceIdentity(input.source)
        packageBytes = copyBytes(input.packageBytes, MAX_PACKAGE_BYTES)
        backupBytes = copyBytes(input.backupBytes, MAX_BACKUP_BYTES)
        password = passphraseBytes(input.passphrase)
        const backup = backupEnvelope(backupBytes, source)
        const envelope = packageEnvelope(packageBytes, source, backupBytes)
        wrappingKey = await derive(password, envelope.kdf)
        key = decrypt(Buffer.from(envelope.data, 'hex'), wrappingKey, Buffer.from(envelope.iv, 'hex'),
            Buffer.from(envelope.tag, 'hex'), Buffer.from(JSON.stringify(header(envelope)), 'utf8'))
        requireValid(key.length === 32)
        plaintext = decryptBackup(backup, key)
        // No key or SQL is returned before both authentication steps succeed.
        const result = returnBackup ? plaintext : key
        if (returnBackup) plaintext = null
        else key = null
        return result
    } catch { throw invalid() }
    finally {
        packageBytes?.fill(0); backupBytes?.fill(0); password?.fill(0); wrappingKey?.fill(0); key?.fill(0); plaintext?.fill(0)
    }
}

module.exports = { wrapKey, unwrapKey: input => unlock(input, false), openBackup: input => unlock(input, true),
    FORMAT, ERROR_CODE, MAX_PACKAGE_BYTES, MAX_BACKUP_BYTES }
