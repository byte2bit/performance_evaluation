const { createHmac } = require('node:crypto')
const { RateLimiterMySQL } = require('rate-limiter-flexible')
const { normalizeEmail } = require('./identity')

function createLimits(db, config, Limiter = RateLimiterMySQL) {
    const dbName = db.client?.config?.connection?.database
    if (typeof dbName !== 'string' || !dbName) throw new Error('Banco de limitação não configurado.')
    const limiter = (prefix, points, duration) => new Limiter({
        storeClient: db, storeType: 'knex', dbName, tableName: 'auth_rate_limits',
        tableCreated: true, clearExpiredByTimeout: false, keyPrefix: prefix, points, duration
    })
    const budgets = {
        management: [[limiter('management-user', 30, 900), req => req.user.id]],
        csrf: [[limiter('csrf-ip', 100, 900), req => req.ip]],
        signin: [
            [limiter('signin-ip', 100, 900), req => req.ip],
            [limiter('signin-pair', 5, 900), req => [req.ip, normalizeEmail(req.body?.email) || 'invalid']]
        ],
        password: [
            [limiter('password-ip', 100, 900), req => req.ip],
            [limiter('password-user', 5, 900), req => req.user.id]
        ],
        mail: [
            [limiter('mail-ip', 100, 60), req => req.ip],
            [limiter('mail-user', 10, 60), req => req.user.id]
        ]
    }
    return kind => async (req, res, next) => {
        try {
            for (const [budget, key] of budgets[kind]) {
                const digest = createHmac('sha256', config.rateSecret).update(JSON.stringify(key(req))).digest('hex')
                await budget.consume(digest)
            }
            next()
        } catch (error) {
            if (Number.isFinite(error?.msBeforeNext) && error.msBeforeNext >= 0) {
                res.set('Retry-After', String(Math.max(1, Math.ceil(error.msBeforeNext / 1000))))
                return res.status(429).send('Muitas tentativas. Aguarde antes de tentar novamente.')
            }
            return res.status(503).send('Serviço de autenticação indisponível.')
        }
    }
}

module.exports = { createLimits }
