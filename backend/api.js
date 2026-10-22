const app = require('express')()
var cors = require('cors')

/* var https = require('https')
var http = require('http')
var fs = require('fs')

var options = {
    key: fs.readFileSync('/etc/letsencrypt/live/nucleoengenharia.com.br/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/nucleoengenharia.com.br/cert.pem')
}; */

/* const corsOptions = {
    origin: 'https://nucleo.nucleoengenharia.com.br', // Replace with your allowed origin
    methods: 'GET, POST, PUT, DELETE, OPTIONS',
    allowedHeaders: 'Content-Type, Authorization'
} */

var vhost = require('vhost')
app.use(cors())
app.use(vhost('api.nucleoengenharia.com.br', require('./index.js')))
    // .use(vhost('sync.mysite.com', require('/path/to/sync').app))
    // https.createServer(options, app)
    .listen(8000)

app.listen(() => {
    console.log("Backend executando na porta 8000")
})
