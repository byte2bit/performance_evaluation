const { normalizeEmail, isAdmin, active } = require('./identity')
const { validPassword, createPasswords } = require('./passwords')

function createAccounts(db, passwords = createPasswords()) {
    async function create({ name, email, password, admin = false }) {
        email = normalizeEmail(email)
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 255 ||
            !email || !validPassword(password) || typeof admin !== 'boolean') throw new Error('Dados de conta inválidos.')
        const hash = await passwords.hash(password)
        await db('users2').insert({ name: name.trim(), email, password: hash, admin, active: true, session_version: 0 })
    }
    async function change(id, action, password) {
        if (!Number.isSafeInteger(id) || id < 1 || !['disable', 'promote', 'demote', 'activate'].includes(action) ||
            (action === 'activate' && !validPassword(password))) throw new Error('Operação inválida.')
        const hash = action === 'activate' ? await passwords.hash(password) : undefined
        await db.transaction(async trx => {
            // Consistent lock order also prevents concurrent removal of the last administrator.
            const administrators = await trx('users2').where({ admin: true, active: true }).whereNull('deletedAt')
                .orderBy('id').forUpdate().select('id')
            const user = await trx('users2').where({ id }).forUpdate().first()
            if (!user || user.deletedAt != null) throw new Error('Conta não disponível.')
            if (['disable', 'demote'].includes(action) && active(user) && isAdmin(user) && administrators.length <= 1) {
                throw new Error('Preserve pelo menos um administrador ativo.')
            }
            const updates = { session_version: trx.raw('session_version + 1') }
            if (action === 'disable') updates.active = false
            if (action === 'activate') Object.assign(updates, { active: true, password: hash })
            if (action === 'promote') updates.admin = true
            if (action === 'demote') updates.admin = false
            await trx('users2').where({ id }).update(updates)
        })
    }
    return { create, change }
}

module.exports = { createAccounts }
