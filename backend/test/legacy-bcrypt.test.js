const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createLegacyBcrypt } = require('../lib/auth/legacy-bcrypt')
const { isLegacyHash, validLegacyPassword } = require('../lib/auth/legacy-bcrypt-format')
const fixtures = require('./helpers/legacy-bcrypt-fixture')
const { stored, password } = fixtures.ascii
const unavailable = error => error.code === 'LEGACY_BCRYPT_UNAVAILABLE' && error.message === 'Serviço indisponível.'

function workers({ gateTermination = false, failTermination = false, constructionFails = false } = {}) {
    const instances = []
    class FakeWorker extends EventEmitter {
        constructor(file, options) {
            super()
            if (constructionFails) throw new Error('synthetic private constructor detail')
            this.file = file; this.options = options; this.terminated = false
            this.stdout = { resume() {} }; this.stderr = { resume() {} }
            instances.push(this)
        }
        terminate() {
            this.terminated = true
            if (failTermination) return Promise.reject(new Error('synthetic private termination detail'))
            if (gateTermination) return new Promise(resolve => { this.release = resolve })
            return Promise.resolve(0)
        }
    }
    return { instances, FakeWorker }
}
const turn = () => new Promise(resolve => setImmediate(resolve))

test('legacy input accepts only observed revision/cost, 72 UTF-8 bytes and well-formed non-NUL passwords', () => {
    assert.equal(isLegacyHash(stored), true)
    for (const hash of [null, '', stored + 'x', stored.replace('$2a$', '$2b$'), stored.replace('$2a$', '$2y$'),
        stored.replace('$10$', '$09$'), stored.replace('$10$', '$31$'), stored.slice(0, -1) + '!']) assert.equal(isLegacyHash(hash), false)
    for (const value of [password, fixtures.unicode.password, 'a'.repeat(72), 'é'.repeat(36), '🔒'.repeat(18), ' ']) assert.equal(validLegacyPassword(value), true)
    for (const value of [null, '', [], 'a'.repeat(73), 'é'.repeat(36) + 'a', '🔒'.repeat(18) + 'a', 'before\0after', '\ud800', '\udc00']) assert.equal(validLegacyPassword(value), false)
})

test('real worker verifies ASCII, UTF-8, boundary and independent public bcrypt vectors, and rejects wrong or altered input', async t => {
    const legacy = createLegacyBcrypt(); t.after(() => legacy.close())
    for (const fixture of Object.values(fixtures)) {
        assert.equal(await legacy.verify(fixture.stored, fixture.password), true)
        assert.equal(await legacy.verify(fixture.stored, 'wrong-synthetic-password'), false)
    }
    assert.equal(await legacy.verify(fixtures.unicode.stored, fixtures.unicode.password.normalize('NFD')), false)
    assert.equal(await legacy.verify(stored, ' ' + password), false)
    assert.equal(await legacy.verify(fixtures.boundary.stored, 'a'.repeat(73)), false)
})

test('invalid revision, cost, size and password are rejected without spawning a worker', async () => {
    const fake = workers(), legacy = createLegacyBcrypt({ WorkerClass: fake.FakeWorker })
    try {
        for (const [hash, input] of [[stored.replace('$10$', '$31$'), password], [stored.replace('$2a$', '$2b$'), password],
            [stored, 'é'.repeat(37)], [stored, 'x\0y'], ['x'.repeat(100000), password]]) assert.equal(await legacy.verify(hash, input), false)
        assert.equal(fake.instances.length, 0)
    } finally { await legacy.close() }
})

test('bounded queue rejects overload and never reuses a slot before the preceding worker terminates', async () => {
    const fake = workers({ gateTermination: true }), legacy = createLegacyBcrypt({ WorkerClass: fake.FakeWorker, maxWorkers: 1, maxQueue: 1 })
    const one = legacy.verify(stored, password), two = legacy.verify(stored, password)
    try {
        await assert.rejects(legacy.verify(stored, password), unavailable)
        assert.equal(fake.instances.length, 1)
        const first = fake.instances[0]
        assert.deepEqual(first.options.env, {}); assert.deepEqual(first.options.execArgv, [])
        assert.equal(first.options.stdout, true); assert.equal(first.options.stderr, true)
        assert.equal(first.options.resourceLimits.maxOldGenerationSizeMb, 32)
        first.emit('message', { matches: true }); await turn()
        assert.equal(first.terminated, true); assert.equal(fake.instances.length, 1)
        first.release(0); assert.equal(await one, true); await turn()
        assert.equal(fake.instances.length, 2)
        const second = fake.instances[1]
        second.emit('message', { matches: false }); await turn(); second.release(0)
        assert.equal(await two, false)
    } finally { await legacy.close() }
})

test('two-worker capacity is bounded independently from queue capacity', async () => {
    const fake = workers(), legacy = createLegacyBcrypt({ WorkerClass: fake.FakeWorker, maxWorkers: 2, maxQueue: 0 })
    const jobs = [legacy.verify(stored, password), legacy.verify(stored, password)]
    await assert.rejects(legacy.verify(stored, password), unavailable)
    assert.equal(fake.instances.length, 2)
    fake.instances.forEach(worker => worker.emit('message', { matches: true }))
    assert.deepEqual(await Promise.all(jobs), [true, true]); await legacy.close()
})

test('deadline cancels active and queued work without silently retrying', async () => {
    const fake = workers({ gateTermination: true }), legacy = createLegacyBcrypt({ WorkerClass: fake.FakeWorker, timeoutMs: 25 })
    const one = assert.rejects(legacy.verify(stored, password), unavailable)
    const two = assert.rejects(legacy.verify(stored, password), unavailable)
    // Keep the active slot occupied after timeout; the queued job must expire
    // without creating another worker or extending its deadline on dequeue.
    await new Promise(resolve => setTimeout(resolve, 60))
    assert.equal(fake.instances.length, 1); assert.equal(fake.instances[0].terminated, true)
    fake.instances[0].release(0)
    await Promise.all([one, two]); await legacy.close()
})

test('worker error, early exit, malformed response and constructor failure become the same generic failure', async () => {
    for (const issue of ['error', 'exit', 'message', 'constructor']) {
        const fake = workers({ constructionFails: issue === 'constructor' }), legacy = createLegacyBcrypt({ WorkerClass: fake.FakeWorker })
        const result = assert.rejects(legacy.verify(stored, password), unavailable)
        if (issue === 'error') fake.instances[0].emit('error', new Error('synthetic private hash or password detail'))
        if (issue === 'exit') fake.instances[0].emit('exit', 0)
        if (issue === 'message') fake.instances[0].emit('message', { matches: true, privateDetail: 'synthetic' })
        await result
        if (issue !== 'constructor') assert.equal(fake.instances[0].terminated, true)
        await legacy.close()
    }
})

test('termination failure closes admission instead of permitting unbounded workers', async () => {
    const fake = workers({ failTermination: true }), legacy = createLegacyBcrypt({ WorkerClass: fake.FakeWorker })
    const one = assert.rejects(legacy.verify(stored, password), unavailable)
    const two = assert.rejects(legacy.verify(stored, password), unavailable)
    fake.instances[0].emit('message', { matches: true })
    await Promise.all([one, two])
    await assert.rejects(legacy.verify(stored, password), unavailable)
    assert.equal(fake.instances.length, 1); await legacy.close()
})

test('close cancels active/queued work, is idempotent, and rejects subsequent use', async () => {
    const fake = workers(), legacy = createLegacyBcrypt({ WorkerClass: fake.FakeWorker })
    const jobs = [assert.rejects(legacy.verify(stored, password), unavailable), assert.rejects(legacy.verify(stored, password), unavailable)]
    const closing = legacy.close()
    assert.equal(legacy.close(), closing)
    await closing; await Promise.all(jobs)
    assert.equal(fake.instances[0].terminated, true)
    await assert.rejects(legacy.verify(stored, password), unavailable)
})

test('configuration refuses unbounded workers, queues or deadlines', () => {
    for (const options of [{ maxWorkers: 0 }, { maxWorkers: 3 }, { maxWorkers: 1.5 }, { maxQueue: -1 }, { maxQueue: 9 },
        { timeoutMs: 0 }, { timeoutMs: 10001 }, { timeoutMs: '5000' }]) assert.throws(() => createLegacyBcrypt(options), unavailable)
})
