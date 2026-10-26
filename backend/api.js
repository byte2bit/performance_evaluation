const app = require('express')()


var vhost = require('vhost')
app.use(vhost('api.mysite.com', require('./index.js')))
    // .use(vhost('sync.mysite.com', require('/path/to/sync').app))
    // https.createServer(options, app)
if (require.main === module) {
    app.listen(8000, () => {
        console.log("Backend executando na porta 8000")
    })
}

module.exports = app
