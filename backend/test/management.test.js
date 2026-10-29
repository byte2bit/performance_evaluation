const test = require('node:test')
const assert = require('node:assert/strict')
const knex = require('knex')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { harness, password, email } = require('./helpers/auth-harness')
const { validEvaluation } = require('./helpers/evaluation-fixture')
const migration = require('../migrations/20261027000100_add_management_departments')
const { migrateManagementCopy, previewTarget } = require('../scripts/isolated-management')

async function adminClient(app) { const client = app.client(); await client.login('admin@example.invalid'); return client }
const mutation = async (client, method, url, body = {}) => client.request(method, url, body, { 'X-CSRF-Token': await client.csrf() })

test('management endpoints enforce anonymous denial, admin permission, Origin/CSRF and rate limits', async t => {
    const app = await harness(t), anonymous = app.client(), reviewer = app.client(), admin = await adminClient(app)
    await reviewer.login()
    for (const [method, url, body] of [['GET', '/demandantes'], ['POST', '/demandantes', {}], ['PUT', '/demandantes/2', {}],
        ['DELETE', '/demandantes/2', {}], ['POST', '/gerencias', {}], ['PUT', '/gerencias/1', {}], ['DELETE', '/gerencias/1', {}], ['PUT', '/colab/1', {}]]) {
        assert.equal((await anonymous.request(method, url, body)).status, 401)
        assert.equal((await mutation(reviewer, method, url, body)).status, 403)
        if (method !== 'GET') assert.equal((await admin.request(method, url, body)).status, 403)
    }
    assert.deepEqual((await reviewer.request('GET', '/gerencias')).json().map(row => row.id), [1])
    app.state.limits.management = 429
    assert.equal((await mutation(admin, 'POST', '/demandantes', { name: 'Fictício', email: 'new@example.invalid', password })).status, 429)
    assert.equal(app.state.writes.length, 0)
})

test('account creation provisions an evaluator, never returns a hash, rejects duplicates and privilege injection', async t => {
    const app = await harness(t), admin = await adminClient(app)
    const body = { name: ' Novo fictício ', email: ' NEW@example.invalid ', password }
    assert.equal((await mutation(admin, 'POST', '/demandantes', body)).status, 204)
    const user = app.state.tables.users2.at(-1)
    assert.equal(user.name, 'Novo fictício'); assert.equal(user.email, 'new@example.invalid'); assert.equal(user.admin, false)
    assert.equal(user.password, 'hash:' + password)
    const next = app.client(); assert.equal((await next.login('new@example.invalid')).status, 200)
    const result = await admin.request('GET', '/demandantes')
    assert.equal(result.status, 200)
    assert.ok(result.json().every(row => !Object.hasOwn(row, 'password') && !Object.hasOwn(row, 'session_version')))
    assert.equal((await mutation(admin, 'POST', '/demandantes', body)).status, 409)
    assert.equal((await mutation(admin, 'POST', '/demandantes', { ...body, email: 'inject@example.invalid', admin: true })).status, 400)
    assert.equal((await mutation(admin, 'POST', '/demandantes', { ...body, password: 'short' })).status, 400)
})

test('account edits keep department ownership by ID, preserve authors and revoke the previous sessions', async t => {
    const app = await harness(t), admin = await adminClient(app), reviewer = app.client(); await reviewer.login()
    const authors = structuredClone(app.state.tables.registros)
    assert.equal((await mutation(admin, 'PUT', '/demandantes/2', { name: 'Novo nome', email: 'renamed@example.invalid' })).status, 204)
    assert.equal((await reviewer.request('GET', '/registros')).status, 401)
    assert.equal((await reviewer.login('renamed@example.invalid')).status, 200)
    assert.equal((await reviewer.request('GET', '/registros/1')).status, 200)
    assert.equal(app.state.tables.gerencias[0].demandante_id, 2)
    assert.deepEqual(app.state.tables.registros, authors)
})

test('department reassignment transfers all its professionals/history while preserving other departments and authors', async t => {
    const app = await harness(t), admin = await adminClient(app), previous = app.client(), current = app.client()
    await previous.login(); await current.login('other@example.invalid')
    app.state.tables.gerencias.push({ id: 3, nome: 'Gerência adicional', demandante_id: 2, deletedAt: null })
    app.state.tables.colab.push({ id: 3, colab: 'Profissional C', gerencia_id: 1, deletedAt: null }, { id: 4, colab: 'Profissional D', gerencia_id: 3, deletedAt: null })
    app.state.tables.registros.push({ id: 3, colab_id: 3, demandante: 'admin@example.invalid' }, { id: 4, colab_id: 4, demandante: email })
    const records = structuredClone(app.state.tables.registros)
    assert.equal((await mutation(admin, 'PUT', '/gerencias/1', { nome: 'Gerência renomeada', demandante_id: 3 })).status, 204)
    assert.deepEqual((await previous.request('GET', '/registros')).json().map(row => row.id), [4])
    assert.deepEqual((await current.request('GET', '/registros2')).json().map(row => row.id), [1, 2, 3])
    assert.equal((await previous.request('GET', '/registros/3')).status, 404)
    assert.deepEqual(app.state.tables.registros, records)
    assert.equal((await current.request('GET', '/colab/1')).json().gerencia, 'Gerência renomeada')
    assert.equal((await current.request('GET', '/colab/1')).json().demandante, 'other@example.invalid')
    assert.equal((await mutation(previous, 'POST', '/registros', validEvaluation({ colab_id: 1 }))).status, 403)
})

test('professional creation/edit derive the owner from the selected department and preserve historical snapshots', async t => {
    const app = await harness(t), admin = await adminClient(app), reviewer = app.client(), other = app.client()
    await reviewer.login(); await other.login('other@example.invalid')
    assert.equal((await mutation(admin, 'POST', '/colab', { colab: 'Novo', gerencia_id: 1, demandante: 'forged@example.invalid', gerencia: 'fake' })).status, 204)
    assert.equal(app.state.tables.colab.at(-1).demandante, email)
    const before = structuredClone(app.state.tables.registros)
    assert.equal((await mutation(admin, 'PUT', '/colab/1', { colab: 'Nome corrigido', gerencia_id: 2 })).status, 204)
    assert.equal((await reviewer.request('GET', '/registros/1')).status, 404)
    assert.equal((await other.request('GET', '/registros/1')).status, 200)
    assert.deepEqual(app.state.tables.registros, before)
    assert.equal((await mutation(admin, 'POST', '/colab', { colab: 'Sem gerência', demandante: email })).status, 400)
    assert.equal((await mutation(admin, 'POST', '/colab', { colab: 'Indisponível', gerencia_id: 999 })).status, 409)
})

test('creating or editing a professional cannot omit or clear the department and its responsible', async t => {
    const app = await harness(t), admin = await adminClient(app)
    const before = structuredClone(app.state.tables)
    for (const [method, url] of [['POST', '/colab'], ['PUT', '/colab/1']]) {
        for (const value of [undefined, null, '', 0, -1, false, [], {}]) {
            const body = { colab: 'Profissional fictício', demandante: email }
            if (value !== undefined) body.gerencia_id = value
            assert.equal((await mutation(admin, method, url, body)).status, 400)
            assert.deepEqual(app.state.tables.colab, before.colab)
            assert.deepEqual(app.state.tables.gerencias, before.gerencias)
            assert.deepEqual(app.state.tables.users2, before.users2)
            assert.deepEqual(app.state.tables.registros, before.registros)
        }
    }
})

test('creating or moving a professional rejects a department whose responsible is missing, inactive or deleted', async t => {
    const app = await harness(t), admin = await adminClient(app)
    for (const state of ['missing', 'inactive', 'deleted']) {
        const owner = app.state.tables.users2.find(row => row.id === 3)
        app.state.tables.gerencias.find(row => row.id === 2).demandante_id = state === 'missing' ? 999 : owner.id
        owner.active = state !== 'inactive'
        owner.deletedAt = state === 'deleted' ? new Date('2026-10-27T00:00:00Z') : null
        const before = structuredClone(app.state.tables)
        for (const [method, url] of [['POST', '/colab'], ['PUT', '/colab/1']]) {
            assert.equal((await mutation(admin, method, url, { colab: 'Profissional fictício', gerencia_id: 2 })).status, 409)
            assert.deepEqual(app.state.tables.colab, before.colab)
            assert.deepEqual(app.state.tables.gerencias, before.gerencias)
            assert.deepEqual(app.state.tables.users2, before.users2)
            assert.deepEqual(app.state.tables.registros, before.registros)
        }
    }
})

test('archiving removes professionals from selection and writing but preserves authorized historical reads', async t => {
    const app = await harness(t), admin = await adminClient(app), reviewer = app.client(); await reviewer.login()
    const records = structuredClone(app.state.tables.registros)
    assert.equal((await mutation(admin, 'DELETE', '/colab/1')).status, 204)
    assert.equal(app.state.tables.colab.length, 2)
    assert.equal((await reviewer.request('GET', '/colab')).json().length, 0)
    assert.equal((await reviewer.request('GET', '/colab/1')).status, 404)
    assert.equal((await reviewer.request('GET', '/registros/1')).status, 200)
    assert.equal((await mutation(reviewer, 'POST', '/registros', validEvaluation({ colab_id: 1 }))).status, 403)
    assert.equal((await admin.request('GET', '/colab?estado=todos')).json().length, 2)
    assert.equal((await mutation(admin, 'PUT', '/colab/1', { colab: 'Mudar arquivado', gerencia_id: 1 })).status, 404)
    assert.deepEqual(app.state.tables.registros, records)
})

test('department and account deletion require reassignment and preserve archived historical ownership', async t => {
    const app = await harness(t), admin = await adminClient(app), reviewer = app.client(); await reviewer.login()
    assert.equal((await mutation(admin, 'DELETE', '/demandantes/2')).status, 409)
    assert.equal((await mutation(admin, 'DELETE', '/demandantes/1')).status, 409)
    assert.equal((await mutation(admin, 'DELETE', '/gerencias/1')).status, 409)
    await mutation(admin, 'DELETE', '/colab/1')
    assert.equal((await mutation(admin, 'DELETE', '/gerencias/1')).status, 204)
    assert.equal((await reviewer.request('GET', '/registros/1')).status, 200)
    assert.equal((await mutation(admin, 'DELETE', '/demandantes/2')).status, 409)
    await mutation(admin, 'PUT', '/gerencias/1', { nome: 'Histórica', demandante_id: 3 })
    assert.equal((await mutation(admin, 'DELETE', '/demandantes/2')).status, 204)
    assert.equal((await reviewer.request('GET', '/session')).status, 401)
    assert.ok(app.state.tables.users2.find(row => row.id === 2).deletedAt)
    assert.equal(app.state.tables.registros.length, 2)
    assert.equal((await mutation(admin, 'POST', '/demandantes', { name: 'Não reutilizar', email, password })).status, 409)
})

test('inactive owners cannot receive departments or new professionals and legacy text never grants access', async t => {
    const app = await harness(t), admin = await adminClient(app), reviewer = app.client(); await reviewer.login()
    assert.equal((await mutation(admin, 'POST', '/gerencias', { nome: 'Teste', demandante_id: 4 })).status, 409)
    app.state.tables.users2[2].active = false
    assert.equal((await mutation(admin, 'POST', '/colab', { colab: 'Teste', gerencia_id: 2 })).status, 409)
    app.state.tables.colab[0].gerencia_id = null
    assert.equal((await reviewer.request('GET', '/colab/1')).status, 404)
    assert.equal((await reviewer.request('GET', '/registros/1')).status, 404)
    assert.equal((await admin.request('GET', '/registros/1')).status, 200)
})

test('management migration compiles only the new links/archive metadata and removal of the obsolete name FK', async () => {
    const db = knex({ client: 'mysql' }); db.client.acquireConnection = () => assert.fail('No SQL connection allowed')
    try {
        const sql = migration.changes(db).flatMap(change => change.toSQL().map(item => item.sql)).join('\n')
        assert.match(sql, /create table `gerencias`/)
        assert.match(sql, /`demandante_id` int unsigned not null/)
        assert.match(sql, /add `gerencia_id` int unsigned null/)
        assert.match(sql, /drop foreign key `registros_colab_foreign`/)
        assert.doesNotMatch(sql, /drop column|drop table|delete from|insert into|update `/i)
        await assert.rejects(migration.down(), /backup/)
    } finally { await db.destroy() }
    const blocked = () => ({ whereNull() { return this }, async count() { return [{ total: 1 }] } })
    blocked.schema = { createTable() { assert.fail('No DDL before reviewed evaluation links') } }
    await assert.rejects(migration.up(blocked), /Concilie/)
})

test('copy migration gate never runs DDL for another baseline or an unexpected pending migration', async () => {
    const filename = '20261027000100_add_management_departments.js'
    for (const [count, pending] of [[11, [filename]], [13, []], [12, ['unexpected.js']], [12, [filename, 'unexpected.js']]]) {
        await assert.rejects(migrateManagementCopy({ migrate: { async list() { return [Array(count), pending] }, latest() { assert.fail('DDL is forbidden after a baseline failure') } } }))
    }
})

test('copy preview accepts only the successfully verified schema named by the explicit protected report', () => {
    const profile = { database: 'evaluation_isolated_fixture' }, filename = 'management-report-123456abcdef.json'
    const report = { success: true, sourceDatabase: profile.database, sourceBusinessAndSchemaPreserved: true,
        copyMigrations: 13, copyDatabase: profile.database + '_mgmt_123456abcdef', encryptedBackup: 'management-backup-123456abcdef.evalbackup' }
    assert.equal(previewTarget(profile, report, filename), report.copyDatabase)
    for (const change of [{ copyDatabase: profile.database }, { sourceDatabase: 'another' }, { success: false },
        { sourceBusinessAndSchemaPreserved: false }, { copyMigrations: 12 }]) assert.throws(() => previewTarget(profile, { ...report, ...change }, filename))
    for (const value of [undefined, '../' + filename, 'unrelated.json']) assert.throws(() => previewTarget(profile, report, value))
})

test('legacy runners stop before SQL and source serving refuses baseline 12 without opening HTTP or running DDL', t => {
    const temporaryRoot = fs.realpathSync(os.tmpdir())
    const directory = fs.mkdtempSync(path.join(temporaryRoot, 'evaluation-management-guard-'))
    t.after(() => {
        const target = fs.realpathSync(directory)
        assert.equal(path.dirname(target).toLowerCase(), temporaryRoot.toLowerCase())
        assert.match(path.basename(target), /^evaluation-management-guard-[a-zA-Z0-9]+$/)
        fs.rmSync(target, { recursive: true, force: true })
    })
    const profile = { kind: 'evaluation-isolated-mysql-v1', id: 'a'.repeat(32), host: '127.0.0.1', port: 50070,
        database: 'evaluation_isolated_aaaaaaaaaaaa', dataDirectory: path.join(directory, 'data'), serverUuid: '00000000-0000-0000-0000-000000000000' }
    fs.writeFileSync(path.join(directory, 'profile.json'), JSON.stringify(profile))
    const preload = path.join(directory, 'preload.cjs')
    fs.writeFileSync(preload, `
const mysql = require(${JSON.stringify(require.resolve('mysql2/promise'))});
require('node:http').createServer = () => { throw new Error('HTTP_FORBIDDEN'); };
mysql.createConnection = async () => {
 if (process.argv[2] !== 'serve') throw Object.assign(new Error('SQL_FORBIDDEN'), {code:'SQL_FORBIDDEN'});
 return { async query(sql) {
  if (!sql.startsWith('SELECT ')) throw new Error('WRITE_FORBIDDEN');
  if (sql.includes('@@datadir')) return [[${JSON.stringify({ directory: profile.dataDirectory, port: profile.port, uuid: profile.serverUuid, bindAddress: '127.0.0.1', version: 'fixture' })}]];
  if (sql.includes('migrations')) return [Array.from({length:12},()=>({name:'fixture'}))];
  throw new Error('UNEXPECTED_SQL');
 }, async end() {} };
};`)
    for (const action of ['validate', 'visualreview', 'serve']) {
        const env = { SystemRoot: process.env.SystemRoot, TEMP: temporaryRoot, TMP: temporaryRoot,
            EVAL_ISOLATED_PROFILE: path.join(directory, 'profile.json') }
        for (const role of ['ROOT', 'MIGRATION', 'APP', 'ADMIN', 'EVALUATOR']) env['EVAL_ISOLATED_' + role + '_PASSWORD'] = 'ab'.repeat(32)
        const child = spawnSync(process.execPath, ['--require', preload, path.resolve(__dirname, '../scripts/isolated-auth.js'), action], { env, encoding: 'utf8', timeout: 10000, windowsHide: true })
        assert.equal(child.status, 1)
        const result = JSON.parse(child.stderr.trim())
        assert.equal(result.code, action === 'serve' ? 'SOURCE_REQUIRED_DEPARTMENT_TRANSITION_PENDING' : 'LEGACY_RUNNER_REQUIRES_MANAGEMENT_REVIEW')
    }
})
