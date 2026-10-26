const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const test = require('node:test')
const proxyaddr = require('proxy-addr')

test('JSON parsing survives malformed compressed input and retains normal parsing and size limits', () => {
    // A crash regression must not terminate the test runner. This child loads
    // only Express and the real middleware configuration, never app/db/mail.
    const probe = `
        const http = require('node:http')
        const zlib = require('node:zlib')
        const express = require('express')
        const app = express()
        const noop = (req, res, next) => next()
        app.config = { passport: { config: { origin: 'http://localhost:5173', trustProxy: [] },
            noStore: noop, httpsOnly: noop, ready: noop, sessionMiddleware: noop, lifecycle: noop,
            passport: { initialize: () => noop, session: () => noop } } }
        require('./config/middlewares')(app)
        app.post('/synthetic', (req, res) => res.json(req.body))
        app.use((err, req, res, next) => res.status(err.status || 500).end())
        const server = http.createServer(app)
        function request(body, encoding) {
            return new Promise((resolve, reject) => {
                const headers = { 'Content-Type': 'application/json', 'Content-Length': body.length }
                if (encoding) headers['Content-Encoding'] = encoding
                const req = http.request({ host: '127.0.0.1', port: server.address().port,
                    path: '/synthetic', method: 'POST', headers }, res => {
                    const chunks = []
                    res.on('data', chunk => chunks.push(chunk))
                    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }))
                })
                req.setTimeout(3000, () => req.destroy(new Error('Probe timeout')))
                req.on('error', reject)
                req.end(body)
            })
        }
        server.listen(0, '127.0.0.1', async () => {
            try {
                const normal = await request(Buffer.from('{"synthetic":true}'))
                const validGzip = zlib.gzipSync(Buffer.from('{"synthetic":true}'))
                const compressed = await request(validGzip, 'gzip')
                const malformed = await request(Buffer.concat([validGzip, Buffer.from('invalid-gzip-tail')]), 'gzip')
                await new Promise(resolve => setTimeout(resolve, 25))
                const after = await request(Buffer.from('{"stillAlive":true}'))
                const oversized = await request(Buffer.from(JSON.stringify({ text: 'x'.repeat(110000) })))
                process.stdout.write(JSON.stringify({ normal, compressed, malformedStatus: malformed.status, after,
                    oversizedStatus: oversized.status }))
            } catch {
                process.exitCode = 1
            } finally {
                server.closeAllConnections()
                server.close()
            }
        })
    `
    const result = spawnSync(process.execPath, ['-e', probe], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000
    })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.deepEqual(output.normal, { status: 200, body: '{"synthetic":true}' })
    assert.deepEqual(output.compressed, output.normal)
    assert.ok([200, 400].includes(output.malformedStatus))
    assert.deepEqual(output.after, { status: 200, body: '{"stillAlive":true}' })
    assert.equal(output.oversizedStatus, 413)
})

test('proxy trust does not treat arbitrary IPv4 clients as trusted IPv6 subnets', () => {
    for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
        const trust = proxyaddr.compile(subnet)
        assert.equal(trust('203.0.113.9'), false)
        const req = { socket: { remoteAddress: '203.0.113.9' }, headers: { 'x-forwarded-for': '198.51.100.15' } }
        assert.equal(proxyaddr(req, trust), '203.0.113.9')
    }
    for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
        const trust = proxyaddr.compile(subnet)
        assert.equal(trust('10.1.2.3'), true)
        assert.equal(trust('203.0.113.9'), false)
        const req = { socket: { remoteAddress: '10.1.2.3' }, headers: { 'x-forwarded-for': '198.51.100.15' } }
        assert.equal(proxyaddr(req, trust), '198.51.100.15')
    }
})

test('removed PM2 instrumentation and FTP proxy chains cannot re-enter through the dependency lockfile', () => {
    // The old FTP consumer tests are superseded: PM2 7 no longer installs the
    // proxy/FTP packages or OpenCensus. Do not reinstall them merely to test them.
    const packages = Object.keys(require('../package-lock.json').packages)
    const legacy = /(?:^|\/)node_modules\/(?:basic-ftp|get-uri|@pm2\/io|@opencensus\/core|@opencensus\/propagation-b3|uuid)$/
    assert.deepEqual(packages.filter(name => legacy.test(name)), [])
})
