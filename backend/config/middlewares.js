const bodyParser = require('body-parser')
const cors = require('cors')

module.exports = app => {
    const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

    app.use(cors({
        origin: (origin, callback) => {
            callback(null, !origin || origin === frontendOrigin)
        }
    }))
    app.use(bodyParser.json())
}
