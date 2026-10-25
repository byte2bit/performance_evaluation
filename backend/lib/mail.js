const nodemailer = require('nodemailer')

function escapeHtml(value) {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return String(value ?? '').replace(/[&<>"']/g, character => entities[character])
}

function createMailHandler(buildMessage) {
    return async (req, res) => {
        const user = process.env.SMTP_USER
        const pass = process.env.SMTP_PASSWORD
        const port = Number(process.env.SMTP_PORT || 587)
        const secure = process.env.SMTP_SECURE === 'true'

        if (!user?.trim() || !pass || !Number.isInteger(port) || port < 1 || port > 65535) {
            return res.status(503).send('Serviço de e-mail não configurado.')
        }

        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp.office365.com',
                port,
                secure,
                requireTLS: !secure,
                auth: { user, pass },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 30000
            })

            await transporter.sendMail(buildMessage(req.body || {}))
            return res.status(204).send()
        } catch {
            return res.status(502).send('Não foi possível enviar o e-mail.')
        }
    }
}

module.exports = { createMailHandler, escapeHtml }
