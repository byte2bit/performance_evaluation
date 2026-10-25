const app = require('express')()
const consign = require('consign')
const db = require('./config/db')
const http = require('http')

app.db = db

consign()
    .include('./config/passport.js')
    .then('./config/middlewares.js')
    .then('./api/validation.js')
    .then('./api')
    .then('./config/routes.js')
    .into(app)

if (require.main === module) {
    http.createServer(app).listen(8001, () => {
        console.log("Backend executando na porta 8001")
    })
}

module.exports = app
