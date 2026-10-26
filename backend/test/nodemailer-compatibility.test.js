const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const net = require('node:net')
const tls = require('node:tls')
const test = require('node:test')
const nodemailer = require('nodemailer')
const MailComposer = require('nodemailer/lib/mail-composer')

const backend = path.resolve(__dirname, '..')

function evaluate(file, requireStub, bindings = {}) {
    const module = { exports: {} }
    // Preserve the real template syntax and address composition, substituting
    // every existing address before passing it to the real MIME compiler.
    let nextAddress = 0
    const source = fs.readFileSync(path.join(backend, file), 'utf8')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, () => `fixed${++nextAddress}@example.invalid`)
    vm.runInNewContext(source, { module, require: requireStub, ...bindings }, { filename: file, timeout: 1000 })
    return module.exports
}

test('CommonJS consumer compiles both real templates without SMTP and preserves envelope, BCC and escaped content', async t => {
    t.mock.method(net, 'connect', () => { throw new Error('NETWORK_FORBIDDEN') })
    t.mock.method(tls, 'connect', () => { throw new Error('NETWORK_FORBIDDEN') })
    assert.equal(typeof nodemailer.createTransport, 'function')

    for (const name of ['mail', 'mail2']) {
        let result, message
        const helper = evaluate('lib/mail.js', dependency => {
            assert.equal(dependency, 'nodemailer')
            return { createTransport(options) {
                assert.equal(options.secure, false)
                assert.equal(options.requireTLS, true)
                const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' })
                return { async sendMail(data) {
                    message = data
                    result = await transport.sendMail(data)
                    return result
                } }
            } }
        }, { process: { env: { SMTP_USER: 'mailer@example.invalid', SMTP_PASSWORD: 'synthetic-password' } } })
        const handler = evaluate(`api/${name}.js`, dependency => {
            assert.equal(dependency, '../lib/mail')
            return helper
        })({}).mail
        const replies = []
        const res = { status(code) { this.code = code; return this }, send(body) { replies.push({ code: this.code, body }); return this } }
        await handler({ body: {
            colab: name === 'mail2' ? ['Profissional fictício'] : 'Profissional fictício',
            demandante: 'recipient@example.invalid', admnome: 'Avaliador fictício',
            avaliacao: '5', nivel: 'A', desconto: '0%',
            nota_qualidade: '5', nota_prazo: '5', nota_dispon: '5', nota_respon: '5',
            obs_qualidade: '<script>fixture</script>', obs_prazo: '', obs_dispon: '', obs_respon: '',
            itensQualidade: [], itensDispon: []
        } }, res)

        assert.deepEqual(replies, [{ code: 204, body: undefined }])
        const sender = message.from.match(/<([^>]+)>/)[1]
        assert.equal(result.envelope.from, sender, `${name}: sender must remain the configured mailbox`)
        const to = message.to.split(',').map(value => value.trim())
        const bcc = message.bcc.split(',').map(value => value.trim())
        assert.deepEqual(result.envelope.to, [...new Set([...to, ...bcc])])
        assert.ok(result.envelope.to.every(address => /^[^\s<>]+@example\.invalid$/.test(address)))
        assert.ok(Buffer.isBuffer(result.message))
        // Stream transport intentionally retains BCC for inspection. SMTP uses
        // the compiler's default output, which must omit the BCC header.
        const compiled = (await new MailComposer(message).compile().build()).toString('utf8')
        const headers = compiled.split('\r\n\r\n')[0]
        assert.doesNotMatch(headers, /^Bcc:/mi)
        for (const address of bcc) assert.equal(headers.includes(address), false)
        assert.doesNotMatch(compiled, /<script>/i)
        assert.ok(message.html.includes('&lt;script&gt;fixture&lt;/script&gt;'))
        assert.match(compiled, /Content-Type: text\/html/i)
        assert.match(headers, /^Subject: /mi)
    }
})

test('real SMTP transport retains STARTTLS, implicit TLS and timeout settings without opening connections', () => {
    for (const secure of [false, true]) {
        const options = {
            host: 'smtp.example.invalid', port: secure ? 465 : 587, secure, requireTLS: !secure,
            auth: { user: 'mailer@example.invalid', pass: 'synthetic-password' },
            connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 30000
        }
        const transport = nodemailer.createTransport(options)
        try {
            for (const key of ['host', 'port', 'secure', 'requireTLS', 'connectionTimeout', 'greetingTimeout', 'socketTimeout']) {
                assert.equal(transport.transporter.options[key], options[key])
            }
            assert.notEqual(transport.transporter.options.tls?.rejectUnauthorized, false)
        } finally { transport.close() }
    }
})

test('real address parser keeps a quoted greater-than inside the local part of the intended mailbox', () => {
    const parse = require('nodemailer/lib/addressparser')
    const parsed = parse('"Fixture" <"part>other@example.invalid"@intended.example.invalid>')
    assert.equal(parsed.length, 1)
    assert.equal(parsed[0].address, '"part>other@example.invalid"@intended.example.invalid')
})
