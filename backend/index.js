const app = require('express')()
const consign = require('consign')
const db = require('./config/db')
var cors = require('cors')

var http = require('http');

app.db = db
app.use(cors())

consign()
    .include('./config/passport.js')
    .then('./config/middlewares.js')
    .then('./api/validation.js')
    .then('./api')
    .then('./config/routes.js')
    .into(app)

http.createServer(app).listen(8001)

app.listen(() => {
    console.log("Backend executando na porta 8001")
})

module.exports = app