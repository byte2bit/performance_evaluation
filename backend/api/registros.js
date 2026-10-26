const { createRecords } = require('../lib/records')

module.exports = app => createRecords(app.db, { paginated: true })
