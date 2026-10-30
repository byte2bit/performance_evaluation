const { randomBytes, timingSafeEqual } = require('node:crypto')
const { Passport } = require('passport')
const { Strategy } = require('passport-local')
const session = require('express-session')
const { readConfig } = require('./config')
const { createPasswords, validPassword, validLoginPassword } = require('./passwords')
const { normalizeEmail, active, publicUser, isAdmin } = require('./identity')
const { createStore } = require('./session-store')
const { createLimits } = require('./limits')
const { createCredentials } = require('./credentials')

const invoke = (target, method, ...args) => new Promise((resolve, reject) => {
    target[method](...args, error => error ? reject(error) : resolve())
})

function createAuth({ db, config = readConfig(), store = createStore(db),
    passwords = createPasswords(), credentials = createCredentials({ db, passwords }), limit, now = Date.now } = {}) {
    const passport = new Passport()
    const cookie = { httpOnly: true, secure: config.production, sameSite: config.sameSite, path: '/' }
    const clearCookie = res => res.clearCookie(config.cookieName, cookie)
    const serviceError = (error, req, res, next) => {
        if (res.headersSent) return next(new Error('Serviço indisponível.'))
        const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 503
        res.status(status).send(status === 503 ? 'Serviço indisponível.' : 'Requisição inválida.')
    }
    const requireUser = (req, res, next) => req.user ? next() : res.status(401).send('Autenticação necessária.')
    const requireAdmin = (req, res, next) => isAdmin(req.user) ? next() : res.status(403).send('Acesso não permitido.')
    const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next() }
    const httpsOnly = (req, res, next) => !config.production || req.secure ? next() : res.status(503).send('HTTPS obrigatório.')
    const csrf = (req, res, next) => {
        const supplied = req.get('X-CSRF-Token')
        const expected = req.session?.csrfToken
        if (req.get('Origin') !== config.origin || !req.is('application/json') ||
            typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) ||
            typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) ||
            !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
            return res.status(403).send('Requisição não autorizada.')
        }
        next()
    }
    const ready = (req, res, next) => Promise.resolve(store.ready).then(() => next()).catch(() => serviceError(null, req, res, next))

    passport.serializeUser((user, done) => done(null, { id: user.id, version: user.session_version }))
    passport.deserializeUser((identity, done) => {
        if (!Number.isSafeInteger(identity?.id) || identity.id < 1 || !Number.isSafeInteger(identity.version)) return done(null, false)
        db('users2').select('id', 'name', 'email', 'admin', 'active', 'deletedAt', 'session_version')
            .where({ id: identity.id }).first()
            .then(user => done(null, active(user) && normalizeEmail(user.email) && user.session_version === identity.version
                ? { ...publicUser(user), session_version: user.session_version } : false))
            .catch(error => done(error))
    })
    passport.use(new Strategy({ usernameField: 'email', passwordField: 'password' }, async (email, password, done) => {
        try {
            done(null, await credentials(email, password))
        } catch (error) { done(error) }
    }))

    async function destroy(req, res) {
        await invoke(req.session, 'destroy')
        req.user = undefined
        clearCookie(res)
    }

    const lifecycle = async (req, res, next) => {
        if (!req.user && req.session.authStartedAt === undefined) return next()
        const start = req.session.authStartedAt
        const activity = req.session.lastActivityAt
        const current = now()
        if (!req.user || !Number.isFinite(start) || !Number.isFinite(activity) || start > current || activity > current ||
            current - start >= config.absoluteMs || current - activity >= config.idleMs) {
            try { await destroy(req, res); return res.status(401).send('Sessão expirada ou revogada.') }
            catch (error) { return next(error) }
        }
        req.session.lastActivityAt = current
        req.session.cookie.maxAge = Math.min(config.idleMs, config.absoluteMs - (current - start))
        next()
    }

    const handlers = {
        csrfToken(req, res) {
            if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex')
            res.json({ csrfToken: req.session.csrfToken })
        },
        signin(req, res, next) {
            if (!normalizeEmail(req.body?.email) || !validLoginPassword(req.body?.password)) {
                return res.status(400).send('Informe e-mail e senha válidos.')
            }
            passport.authenticate('local', (error, user) => {
                if (error) return next(error)
                if (!user) return res.status(401).send('E-mail ou senha inválidos.')
                req.logIn(user, async error => {
                    if (error) return next(error)
                    try {
                        req.session.authStartedAt = now()
                        req.session.lastActivityAt = now()
                        req.session.csrfToken = randomBytes(32).toString('hex')
                        await invoke(req.session, 'save')
                        res.json(publicUser(user))
                    } catch (error) { next(error) }
                })
            })(req, res, next)
        },
        session(req, res) { res.json(publicUser(req.user)) },
        async signout(req, res, next) {
            try {
                await invoke(req, 'logout')
                await destroy(req, res)
                res.status(204).send()
            } catch (error) { next(error) }
        },
        async changePassword(req, res, next) {
            if (!validLoginPassword(req.body?.currentPassword) || !validPassword(req.body?.newPassword)) {
                return res.status(400).send('A nova senha deve ter de 15 a 128 caracteres.')
            }
            try {
                const changed = await db.transaction(async trx => {
                    const user = await trx('users2').where({ id: req.user.id }).forUpdate().first()
                    if (!active(user) || user.session_version !== req.user.session_version ||
                        !await passwords.verify(user.password, req.body.currentPassword)) return false
                    const hash = await passwords.hash(req.body.newPassword)
                    await trx('users2').where({ id: user.id }).update({
                        password: hash, session_version: trx.raw('session_version + 1')
                    })
                    return true
                })
                if (!changed) return res.status(401).send('Não foi possível alterar a senha.')
                await destroy(req, res)
                res.status(204).send()
            } catch (error) { next(error) }
        }
    }
    return {
        config, passport, ready, noStore, httpsOnly, csrf, requireUser, requireAdmin, lifecycle, handlers,
        limit: limit || createLimits(db, config), errorHandler: serviceError,
        sessionMiddleware: session({ name: config.cookieName, secret: config.secret, store,
            resave: false, saveUninitialized: false, rolling: true,
            cookie: { ...cookie, maxAge: config.idleMs } })
    }
}

module.exports = { createAuth }
