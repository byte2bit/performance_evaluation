const argon2 = require('argon2')
const { randomBytes } = require('node:crypto')

const options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }
const validPassword = value => typeof value === 'string' && [...value].length >= 15 && [...value].length <= 128
const validLoginPassword = value => typeof value === 'string' && value.length > 0 && [...value].length <= 128

function createPasswords() {
    // Created lazily, with no credentials or database reads at module import.
    let dummy
    const hash = password => argon2.hash(password, options)
    async function verify(stored, password) {
        const usable = typeof stored === 'string' && stored.startsWith('$argon2id$')
        if (usable) {
            try { return await argon2.verify(stored, password) }
            catch { /* Malformed legacy data follows the same rejection path. */ }
        }
        if (!dummy) dummy = hash(randomBytes(32).toString('hex'))
        await argon2.verify(await dummy, password)
        return false
    }
    return { hash, verify }
}

module.exports = { createPasswords, validPassword, validLoginPassword }
