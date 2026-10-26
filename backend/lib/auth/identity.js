function normalizeEmail(value) {
    if (typeof value !== 'string') return null
    const email = value.trim().toLowerCase()
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

const flag = value => value === true || value === 1
const active = user => Boolean(user && flag(user.active) && user.deletedAt == null)
const isAdmin = user => Boolean(user && flag(user.admin))

function publicUser(user) {
    return { id: user.id, name: user.name, email: normalizeEmail(user.email), admin: isAdmin(user) }
}

function scope(query, user) {
    if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 })
    return isAdmin(user) ? query : query.whereRaw('BINARY ?? = ?', ['demandante', user.email])
}

module.exports = { normalizeEmail, flag, active, isAdmin, publicUser, scope }
