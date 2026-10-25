const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const backend = path.resolve(__dirname, '..')
const configured = { SMTP_USER: 'mailer@example.invalid', SMTP_PASSWORD: 'synthetic-password' }

// Execute the real handlers and helper with a fake environment and SMTP transport.
// No application bootstrap, credential file, database or network module is loaded.
function loadHandler(name, env = configured, send = async () => ({}), createError) {
    const transports = []
    const messages = []
    function evaluate(file, requireStub, bindings = {}) {
        const module = { exports: {} }
        vm.runInNewContext(fs.readFileSync(path.join(backend, file), 'utf8'), {
            module, require: requireStub, ...bindings
        }, { filename: file, timeout: 1000 })
        return module.exports
    }
    const helper = evaluate('lib/mail.js', dependency => {
        assert.equal(dependency, 'nodemailer')
        return {
            createTransport(options) {
                if (createError) throw createError
                transports.push(options)
                return {
                    sendMail(message) {
                        messages.push(message)
                        return send(message)
                    }
                }
            }
        }
    }, { process: { env } })
    const api = evaluate(`api/${name}.js`, dependency => {
        assert.equal(dependency, '../lib/mail')
        return helper
    })({})
    const replies = []
    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this },
        send(body) { replies.push({ status: this.statusCode, body }); return this }
    }
    return { handler: api.mail, transports, messages, replies, response }
}

function payload(name) {
    return {
        colab: name === 'mail2' ? ['Profissional fictício'] : 'Profissional fictício',
        demandante: 'recipient@example.invalid',
        avaliacao: '5', nivel: 'A', desconto: '0%',
        nota_qualidade: 5, nota_prazo: 5, nota_dispon: 5, nota_respon: 5,
        obs_qualidade: '', obs_prazo: '', obs_dispon: '', obs_respon: '',
        itensQualidade: [], itensDispon: []
    }
}

for (const name of ['mail', 'mail2']) {
    test(`${name}: missing credentials or invalid port return 503 without creating a transport`, async () => {
        for (const env of [{}, { SMTP_USER: configured.SMTP_USER },
            { SMTP_PASSWORD: configured.SMTP_PASSWORD }, { ...configured, SMTP_USER: ' ' },
            ...['0', '-1', '65536', 'abc', '1.5'].map(SMTP_PORT => ({ ...configured, SMTP_PORT }))]) {
            const app = loadHandler(name, env)
            await app.handler({ body: payload(name) }, app.response)
            assert.deepEqual(app.replies, [{ status: 503, body: 'Serviço de e-mail não configurado.' }])
            assert.equal(app.transports.length, 0)
            assert.equal(app.messages.length, 0)
        }
    })

    test(`${name}: waits for SMTP acceptance before replying once with 204`, async () => {
        let complete
        const app = loadHandler(name, configured, () => new Promise(resolve => { complete = resolve }))
        const pending = app.handler({ body: payload(name) }, app.response)
        assert.equal(app.replies.length, 0)
        assert.equal(app.messages.length, 1)
        complete({ messageId: 'synthetic' })
        await pending
        assert.deepEqual(app.replies, [{ status: 204, body: undefined }])
        const options = app.transports[0]
        assert.equal(options.host, 'smtp.office365.com')
        assert.equal(options.port, 587)
        assert.equal(options.secure, false)
        assert.equal(options.requireTLS, true)
        assert.equal(options.auth.user, configured.SMTP_USER)
        assert.equal(options.auth.pass, configured.SMTP_PASSWORD)
        assert.ok(options.connectionTimeout > 0 && options.greetingTimeout > 0 && options.socketTimeout > 0)
        assert.equal(options.tls, undefined)
        // Preserve the existing recipient composition without printing real copy addresses.
        assert.equal(app.messages[0].to.startsWith('recipient@example.invalid,'), true)
        assert.equal(typeof app.messages[0].bcc, 'string')
    })

    test(`${name}: supports externally configured SMTP host, port and implicit TLS`, async () => {
        const app = loadHandler(name, {
            ...configured, SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '465', SMTP_SECURE: 'true'
        })
        await app.handler({ body: payload(name) }, app.response)
        const options = app.transports[0]
        assert.equal(options.host, 'smtp.example.invalid')
        assert.equal(options.port, 465)
        assert.equal(options.secure, true)
        assert.equal(options.requireTLS, false)
        assert.equal(app.replies[0].status, 204)
    })

    test(`${name}: transport and delivery failures return a sanitized 502 once`, async () => {
        const error = new Error('synthetic SMTP credential or recipient detail')
        for (const createError of [undefined, error]) {
            const app = loadHandler(name, configured, async () => { throw error }, createError)
            await app.handler({ body: payload(name) }, app.response)
            assert.deepEqual(app.replies, [{ status: 502, body: 'Não foi possível enviar o e-mail.' }])
        }
    })

    test(`${name}: escapes every dynamic HTML field and preserves the static template`, async () => {
        const attack = '<img src="x" onerror=\'alert(1)\'>&'
        const escaped = '&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;'
        const data = payload(name)
        for (const key of Object.keys(data)) data[key] = attack
        data.admnome = attack
        if (name === 'mail2') data.colab = [attack, 'Profissional fictício']
        data.itensQualidade = [attack]
        data.itensDispon = [attack]
        const app = loadHandler(name)
        await app.handler({ body: data }, app.response)
        assert.equal(app.replies[0].status, 204)
        const html = app.messages[0].html
        assert.equal(html.includes(attack), false)
        assert.ok(html.includes('<h1>Avaliação de Nível de Serviço</h1>'))
        assert.equal(html.split(escaped).length - 1, 15)
    })
}

test('mail2: empty observations retain their existing fallback text', async () => {
    const app = loadHandler('mail2')
    await app.handler({ body: payload('mail2') }, app.response)
    assert.equal(app.messages[0].html.split('Sem observações.').length - 1, 4)
})
