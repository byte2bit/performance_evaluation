const bodyParser = require('body-parser')
const cors = require('cors')

module.exports = app => {
    const auth = app.config.passport
    if (auth.config.trustProxy.length) app.set('trust proxy', auth.config.trustProxy)

    app.use(auth.noStore)
    app.use(auth.httpsOnly)
    app.use(cors({
        credentials: true,
        origin: (origin, callback) => {
            callback(null, !origin || origin === auth.config.origin)
        }
    }))
    app.use(bodyParser.json())
    app.use(auth.ready)
    app.use(auth.sessionMiddleware)
    app.use(auth.passport.initialize())
    app.use(auth.passport.session())
    app.use(auth.lifecycle)
}
