const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const crypto = require('node:crypto')
const test = require('node:test')
const { isolatedPaths } = require('./helpers/pm2-isolation')

test('PM2 fixture refuses reused roots and assigns exclusive Windows pipes before loading clients', () => {
    const id = '0123456789abcdef01234567'
    const root = path.join(os.tmpdir(), `evaluation-pm2-${id}`)
    const paths = isolatedPaths(root, id, 'win32')
    assert.equal(paths.home, path.join(root, 'home'))
    for (const value of [paths.rpc, paths.pub, paths.interactor]) {
        assert.ok(value.startsWith('\\\\.\\pipe\\evaluation-' + id))
        assert.notEqual(value, '\\\\.\\pipe\\rpc.sock')
    }
    assert.throws(() => isolatedPaths(path.join(os.homedir(), '.pm2'), id))
    assert.throws(() => isolatedPaths(root, 'invalid'))
})

test('PM2 argument parsing preserves quoted groups and bounds the ReDoS regression in a child process', () => {
    const result = spawnSync(process.execPath, ['-e', `
        const assert = require('node:assert/strict')
        const config = require('pm2/lib/tools/Config')
        const schema = { type: ['array', 'string'] }
        assert.deepEqual(config._valid('args', 'one "two three" four', schema), ['one', 'two three', 'four'])
        const value = config._valid('args', ' '.repeat(100000) + '"', schema)
        assert.ok(Array.isArray(value))
    `], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000, windowsHide: true })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
})

test('PM2 guard blocks default Windows pipes, TCP clients and TCP servers before any connection', () => {
    const id = crypto.randomBytes(12).toString('hex')
    const root = path.join(os.tmpdir(), `evaluation-pm2-${id}`)
    fs.mkdirSync(root)
    fs.writeFileSync(path.join(root, 'owner.json'), JSON.stringify({ id }), { flag: 'wx' })
    const env = {
        TEMP: os.tmpdir(), TMP: os.tmpdir(), PM2_HOME: path.join(root, 'home'),
        EVALUATION_PM2_PROFILE: root, EVALUATION_PM2_ID: id
    }
    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
    const guard = path.resolve(__dirname, 'helpers/pm2-isolation.js')
    try {
        const result = spawnSync(process.execPath, ['-e', `
            const assert = require('node:assert/strict')
            require(${JSON.stringify(guard)}).install()
            const net = require('node:net')
            const socket = new net.Socket()
            assert.throws(() => socket.connect('\\\\\\\\.\\\\pipe\\\\rpc.sock'), /NETWORK_FORBIDDEN/)
            assert.throws(() => socket.connect({ host: '127.0.0.1', port: 8001 }), /NETWORK_FORBIDDEN/)
            assert.throws(() => net.createServer().listen(0, '127.0.0.1'), /NETWORK_FORBIDDEN/)
            assert.throws(() => fetch('https://example.invalid'), /NETWORK_FORBIDDEN/)
            socket.destroy()
        `], { env, encoding: 'utf8', timeout: 5000, windowsHide: true })
        assert.equal(result.error, undefined)
        assert.equal(result.status, 0, result.stderr)
        assert.equal(fs.readFileSync(path.join(root, 'network-denied.jsonl'), 'utf8').trim().split('\n').length, 4)
    } finally {
        // This exact root was exclusively created above, directly under temp.
        assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
        assert.equal(path.basename(root), `evaluation-pm2-${id}`)
        fs.rmSync(root, { recursive: true })
    }
})
