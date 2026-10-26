const { createAuth } = require('../lib/auth')

module.exports = app => createAuth({ db: app.db })
