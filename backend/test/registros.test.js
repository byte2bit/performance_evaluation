const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function controller(db) {
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../api/registros.js'), 'utf8'), {
        module,
        require(name) {
            assert.equal(name, 'bcrypt-nodejs')
            return {}
        }
    }, { timeout: 1000 })
    return module.exports({ db })
}

function response() {
    const replies = []
    return {
        replies, statusCode: 200,
        status(code) { this.statusCode = code; return this },
        json(body) { replies.push({ status: this.statusCode, body }); return this },
        send(body) { replies.push({ status: this.statusCode, body }); return this }
    }
}

test('GET /registros2 returns its list once, keeps pagination and does not count unused totals', async () => {
    const rows = [{ id: 1, colab: 'Profissional fictício' }]
    const calls = []
    const query = {
        select(...fields) { assert.ok(fields.includes('id')); return this },
        orderBy(...args) { calls.push(['orderBy', ...args]); return this },
        limit(value) { calls.push(['limit', value]); return this },
        offset(value) { calls.push(['offset', value]); return this },
        then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject) }
    }
    let queries = 0
    const api = controller(table => { queries++; assert.equal(table, 'registros'); return query })
    const res = response()
    await api.getReg({ query: { page: '2', limit: '25' } }, res)
    assert.deepEqual(res.replies, [{ status: 200, body: rows }])
    assert.equal(queries, 1)
    assert.deepEqual(calls, [['orderBy', 'created_at', 'desc'], ['limit', '25'], ['offset', 25]])
})

test('GET /registros2 returns one sanitized 500 for rejected and synchronous database failures', async () => {
    const error = new Error('synthetic SQL and connection details')
    for (const synchronous of [false, true]) {
        const api = controller(() => {
            if (synchronous) throw error
            const query = {
                select() { return this }, orderBy() { return this },
                limit() { return this }, offset() { return this },
                then(resolve, reject) { return Promise.reject(error).then(resolve, reject) }
            }
            return query
        })
        const res = response()
        await api.getReg({ query: { page: '1', limit: '25' } }, res)
        assert.deepEqual(res.replies, [{ status: 500, body: 'Não foi possível carregar os registros.' }])
    }
})
