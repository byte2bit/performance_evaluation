const { isIP } = require('node:net')

function readConfig(env = process.env) {
    const production = env.NODE_ENV === 'production'
    const origin = env.FRONTEND_ORIGIN || (production ? '' : 'http://localhost:5173')
    let url
    try { url = new URL(origin) } catch { throw new Error('Configure FRONTEND_ORIGIN com uma origem válida.') }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.origin !== origin || url.username || url.password ||
        !['http:', 'https:'].includes(url.protocol) || (url.protocol !== 'https:' && (production || !local))) {
        throw new Error('FRONTEND_ORIGIN deve ser uma origem exata HTTPS, ou HTTP local em desenvolvimento.')
    }
    if (!production && !local) throw new Error('Origens fora do ambiente local exigem NODE_ENV=production e HTTPS.')
    for (const name of ['SESSION_SECRET', 'AUTH_RATE_LIMIT_SECRET']) {
        if (typeof env[name] !== 'string' || Buffer.byteLength(env[name]) < 32) {
            throw new Error(`Configure ${name} com pelo menos 32 bytes aleatórios externos ao repositório.`)
        }
    }
    if (env.SESSION_SECRET === env.AUTH_RATE_LIMIT_SECRET) throw new Error('Use segredos distintos para sessão e limitação.')
    const sameSite = env.SESSION_SAME_SITE || (production ? '' : 'lax')
    if (!['lax', 'strict', 'none'].includes(sameSite) || (!production && sameSite === 'none')) {
        throw new Error('Configure SESSION_SAME_SITE explicitamente para a topologia de produção.')
    }
    const trustProxy = env.TRUST_PROXY ? env.TRUST_PROXY.split(',').map(value => value.trim()) : []
    for (const entry of trustProxy) {
        const [address, prefix, extra] = entry.split('/')
        const family = isIP(address)
        if (!family || extra !== undefined || (prefix !== undefined &&
            (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)))) {
            throw new Error('TRUST_PROXY aceita somente endereços IP/sub-redes explícitos e válidos.')
        }
    }
    return {
        production, origin, sameSite, trustProxy,
        secret: env.SESSION_SECRET, rateSecret: env.AUTH_RATE_LIMIT_SECRET,
        cookieName: production ? '__Host-evaluation.sid' : 'evaluation.sid',
        idleMs: 30 * 60 * 1000, absoluteMs: 8 * 60 * 60 * 1000
    }
}

module.exports = { readConfig }
