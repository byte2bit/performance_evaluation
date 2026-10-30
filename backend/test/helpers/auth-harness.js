const assert = require('node:assert/strict')
const http = require('node:http')
const express = require('express')
const { MemoryStore } = require('express-session')
const { createAuth } = require('../../lib/auth')
const { readConfig } = require('../../lib/auth/config')

const config = () => readConfig({ SESSION_SECRET: 'synthetic-session-secret-for-tests-only',
    AUTH_RATE_LIMIT_SECRET: 'synthetic-rate-limit-secret-for-tests-only' })
const email = 'reviewer@example.invalid'
const password = 'synthetic-password-for-tests'

function database() {
    const state = {
        now: Date.now(), queries: [], writes: [], limits: {}, mails: 0,
        recordedAt: '2026-10-29 12:00:00', transactionOptions: [], lockEvents: [],
        tables: {
            users2: [
                { id: 1, name: 'Administrador fictício', email: 'admin@example.invalid', admin: 1, active: 1, deletedAt: null, session_version: 0, password: 'hash:' + password },
                { id: 2, name: 'Avaliador fictício', email, admin: 0, active: 1, deletedAt: null, session_version: 0, password: 'hash:' + password },
                { id: 3, name: 'Outro avaliador', email: 'other@example.invalid', admin: 0, active: 1, deletedAt: null, session_version: 0, password: 'hash:' + password },
                { id: 4, name: 'Conta inativa', email: 'inactive@example.invalid', admin: 1, active: 0, deletedAt: null, session_version: 0, password: 'hash:' + password },
                { id: 5, name: 'Conta excluída', email: 'deleted@example.invalid', admin: 1, active: 1, deletedAt: 'synthetic-date', session_version: 0, password: 'hash:' + password }
            ],
            gerencias: [{ id: 1, nome: 'Gerência A', demandante_id: 2, deletedAt: null }, { id: 2, nome: 'Gerência B', demandante_id: 3, deletedAt: null }],
            colab: [{ id: 1, colab: 'Profissional A', gerencia_id: 1, deletedAt: null, demandante: email }, { id: 2, colab: 'Profissional B', gerencia_id: 2, deletedAt: null, demandante: 'other@example.invalid' }],
            registros: [{ id: 1, colab_id: 1, colab: 'Profissional A', demandante: email }, { id: 2, colab_id: 2, colab: 'Profissional B', demandante: 'other@example.invalid' }]
        }
    }
    // Simulate exclusive professional locks for concurrent HTTP fixture tests.
    // This is not an InnoDB emulator; real SQL integration remains opt-in.
    const locks = new Map()
    function db(table, transaction = null) {
        assert.ok(Object.hasOwn(state.tables, table), 'Unexpected table in isolated fixture')
        const predicates = []
        let fields
        let first = false
        let offset = 0
        let limit
        const selected = () => state.tables[table].filter(row => predicates.every(predicate => predicate(row)))
        const result = () => {
            let rows = selected().slice(offset, limit === undefined ? undefined : offset + Number(limit))
            if (fields) rows = rows.map(row => Object.fromEntries(fields.filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]])))
            else rows = rows.map(row => ({ ...row }))
            return first ? rows[0] : rows
        }
        const entry = { table, predicates, lock: null }
        state.queries.push(entry)
        async function lockRows() {
            if (entry.lock !== 'update' || table !== 'colab' || !transaction) return
            for (const row of selected().sort((a, b) => a.id - b.id)) {
                if (transaction.locked.has(row.id)) continue
                const previous = locks.get(row.id) || Promise.resolve()
                let release
                const held = new Promise(resolve => { release = resolve })
                const tail = previous.then(() => held)
                locks.set(row.id, tail)
                state.onProfessionalLock?.(row.id)
                await previous
                transaction.locked.add(row.id)
                state.lockEvents.push({ action: 'acquire', id: row.id })
                transaction.releases.push(() => {
                    state.lockEvents.push({ action: 'release', id: row.id })
                    release()
                    if (locks.get(row.id) === tail) locks.delete(row.id)
                })
            }
        }
        const query = {
            select(...names) { fields = names; return this },
            where(values, operator, comparison) {
                if (typeof values === 'string') {
                    assert.ok(['>=', '<'].includes(operator))
                    predicates.push(row => row[values] != null && (operator === '>=' ? row[values] >= comparison : row[values] < comparison))
                    return this
                }
                predicates.push(row => Object.entries(values).every(([key, value]) => typeof value === 'boolean'
                    ? (row[key] === true || row[key] === 1) === value : key === 'id' ? Number(row[key]) === Number(value) : row[key] === value))
                return this
            },
            whereNull(key) { predicates.push(row => row[key] == null); return this },
            whereIn(key, subquery) {
                predicates.push(row => row[key] != null && (Array.isArray(subquery) ? subquery.includes(row[key]) : subquery.fixtureRows().some(candidate => candidate.id === row[key])))
                return this
            },
            whereRaw(sql, bindings) {
                assert.equal(sql, 'BINARY ?? = ?'); assert.equal(bindings[0], 'demandante')
                predicates.push(row => row.demandante === bindings[1]); return this
            },
            orderBy() { return this }, forUpdate() { entry.lock = 'update'; return this }, forShare() { entry.lock = 'share'; return this },
            limit(value) { limit = value; return this }, offset(value) { offset = value; return this },
            async first() { first = true; await lockRows(); return result() },
            fixtureRows() { return result() },
            then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
            async insert(value) {
                if (table === 'users2' && state.tables.users2.some(row => row.email.toLowerCase() === value.email.toLowerCase())) throw { code: 'ER_DUP_ENTRY' }
                const row = { id: state.tables[table].length + 1, ...value }
                state.tables[table].push(row); state.writes.push({ table, action: 'insert' }); return [row.id]
            },
            async update(values) {
                const rows = selected()
                if (table === 'users2' && values.email && state.tables.users2.some(row => !rows.includes(row) && row.email.toLowerCase() === values.email.toLowerCase())) throw { code: 'ER_DUP_ENTRY' }
                for (const row of rows) for (const [key, value] of Object.entries(values)) row[key] = value?.increment ? row[key] + 1 : value
                state.writes.push({ table, action: 'update' }); return rows.length
            },
            async del() {
                const rows = selected(); state.tables[table] = state.tables[table].filter(row => !rows.includes(row))
                state.writes.push({ table, action: 'delete' }); return rows.length
            }
        }
        return query
    }
    db.transaction = async (callback, options) => {
        state.transactionOptions.push(options)
        const context = { locked: new Set(), releases: [] }
        const trx = table => db(table, context)
        trx.raw = (...args) => db.raw(...args)
        const before = structuredClone(state.tables), writes = state.writes.length
        try { return await callback(trx) }
        catch (error) { state.tables = before; state.writes.length = writes; throw error }
        finally { context.releases.reverse().forEach(release => release()) }
    }
    db.raw = sql => {
        if (sql === require('../../lib/records').recordingClockSql) return Promise.resolve([[{ recorded_at: state.recordedAt }]])
        assert.equal(sql, 'session_version + 1'); return { increment: true }
    }
    return { db, state }
}

async function harness(t, { authConfig = config(), passwordService, credentialsFactory } = {}) {
    const { db, state } = database()
    const store = new MemoryStore() // Tests only. Runtime always uses the SQL store.
    const passwords = passwordService || { async hash(value) { return 'hash:' + value }, async verify(hash, value) { return hash === 'hash:' + value } }
    const auth = createAuth({ db, config: authConfig, store, now: () => state.now,
        passwords,
        credentials: credentialsFactory?.({ db, passwords, state }),
        limit: kind => (req, res, next) => {
            const status = state.limits[kind]
            return status ? res.status(status).send('synthetic limit/service response') : next()
        }
    })
    const app = express()
    app.config = { passport: auth }
    app.api = {
        management: require('../../lib/management').createManagement(db, passwords),
        auth: auth.handlers, user: require('../../api/user')(Object.assign(app, { db })),
        registros: require('../../api/registros')(app),
        mail: { mail(req, res) { state.mails++; res.status(204).end() } },
        mail2: { mail(req, res) { state.mails++; res.status(204).end() } }
    }
    require('../../config/middlewares')(app)
    require('../../config/routes')(app)
    const server = http.createServer(app)
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
    function client() {
        let cookie = ''
        return {
            get cookie() { return cookie },
            set cookie(value) { cookie = value },
            request(method, url, data, headers = {}) {
                return new Promise((resolve, reject) => {
                    const body = data === undefined ? '' : JSON.stringify(data)
                    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: url, method,
                        headers: { Origin: authConfig.origin, 'Content-Type': 'application/json', Cookie: cookie,
                            'Content-Length': Buffer.byteLength(body), ...headers } }, res => {
                        const chunks = []
                        const nextCookie = res.headers['set-cookie']?.[0]
                        if (nextCookie) cookie = nextCookie.split(';')[0]
                        res.on('data', chunk => chunks.push(chunk))
                        res.on('end', () => {
                            const text = Buffer.concat(chunks).toString()
                            resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) })
                        })
                    })
                    req.setTimeout(3000, () => req.destroy(new Error('Isolated request timeout')))
                    req.on('error', reject)
                    req.end(body)
                })
            },
            async csrf() { return (await this.request('GET', '/csrf-token')).json().csrfToken },
            async login(account = email, secret = password) {
                const token = await this.csrf()
                const response = await this.request('POST', '/signin', { email: account, password: secret }, { 'X-CSRF-Token': token })
                return response
            }
        }
    }
    return { client, db, state, store, auth }
}

module.exports = { harness, database, config, email, password }
