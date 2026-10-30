const { createPasswords, validLoginPassword } = require('./passwords')
const { normalizeEmail, active, publicUser } = require('./identity')
const { isLegacyHash, validLegacyPassword } = require('./legacy-bcrypt-format')

const fields = ['id', 'name', 'email', 'password', 'admin', 'active', 'deletedAt', 'session_version']
const identity = user => ({ ...publicUser(user), session_version: user.session_version })

// No legacy verifier by default. Only trusted composition can inject one;
// runtime bootstrap/configuration deliberately does not do so in E2A.
function createCredentials({ db, passwords = createPasswords(), legacy } = {}) {
    if (legacy !== undefined && typeof legacy?.verify !== 'function') throw new Error('Configuração de credenciais inválida.')
    return async function authenticate(email, password) {
        const normalized = normalizeEmail(email)
        if (!normalized || !validLoginPassword(password)) return false
        const user = await db('users2').select(...fields).where({ email: normalized }).first()
        if (!legacy || !isLegacyHash(user?.password)) {
            const matches = await passwords.verify(user?.password, password)
            return matches && active(user) ? identity(user) : false
        }
        if (!active(user)) {
            await passwords.verify(undefined, password)
            return false
        }
        if (!validLegacyPassword(password) || !await legacy.verify(user.password, password)) {
            await passwords.verify(undefined, password)
            return false
        }
        if (!Number.isSafeInteger(user.id) || user.id < 1 || !Number.isSafeInteger(user.session_version) ||
            user.session_version < 0 || user.session_version >= 4294967295) throw new Error('Serviço indisponível.')
        // CPU work precedes the row lock. Never overwrite a password/account
        // decision that changed while either verifier/hash function was running.
        const upgraded = await passwords.hash(password)
        if (typeof upgraded !== 'string' || !upgraded.startsWith('$argon2id$')) throw new Error('Serviço indisponível.')
        return db.transaction(async trx => {
            const current = await trx('users2').select(...fields).where({ id: user.id }).forUpdate().first()
            if (!active(current) || fields.some(field => current[field] !== user[field])) return false
            const nextVersion = user.session_version + 1
            const changed = await trx('users2').where({ id: user.id, session_version: user.session_version }).update({
                password: upgraded, session_version: nextVersion
            })
            if (changed === 0) return false
            if (changed !== 1) throw new Error('Serviço indisponível.')
            return identity({ ...current, session_version: nextVersion })
        })
    }
}

module.exports = { createCredentials }
