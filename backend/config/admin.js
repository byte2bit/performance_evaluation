const { isAdmin } = require('../lib/auth/identity')

module.exports = middleware => (req, res, next) => {
    if (!req.user) return res.status(401).send('Autenticação necessária.')
    if (!isAdmin(req.user)) return res.status(403).send('Acesso não permitido.')
    return middleware(req, res, next)
}
