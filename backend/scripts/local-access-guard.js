// Driver-level guard for the E2B authentication-only fixture server. It never
// rewrites SQL or accepts a business-table name, even for library raw queries.
const driver = require('mysql')
const { TARGET } = require('./local-mysql-copy')
const fixtures = Object.freeze({ users2: 'e2b_accounts_fixture', sessions: 'e2b_sessions_fixture', auth_rate_limits: 'e2b_limits_fixture' })
const names = Object.freeze(Object.values(fixtures).sort())
const ensure = (value, code = 'E2B_FIXTURE_SQL_REFUSED') => { if (!value) throw Object.assign(new Error('Fixture SQL refused'), { code }) }

function tokens(sql) {
    ensure(typeof sql === 'string' && sql.length <= 128 * 1024)
    const result = []
    for (let i = 0; i < sql.length;) {
        const c = sql[i]
        if (/\s/.test(c)) { i++; continue }
        ensure(!sql.startsWith('--', i) && !sql.startsWith('/*', i) && c !== '#')
        if (c === "'" || c === '"') {
            const quote = c; let ended = false; i++
            while (i < sql.length) {
                if (sql[i] === '\\') { i += 2; continue }
                if (sql[i++] === quote) {
                    if (sql[i] === quote) { i++; continue }
                    ended = true; break
                }
            }
            ensure(ended); result.push({ type: 'literal', value: '' }); continue
        }
        if (c === '`') {
            let name = '', ended = false; i++
            while (i < sql.length) {
                const next = sql[i++]
                if (next === '`') {
                    if (sql[i] === '`') { name += '`'; i++; continue }
                    ended = true; break
                }
                name += next
            }
            ensure(ended); result.push({ type: 'identifier', value: name }); continue
        }
        const word = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0]
        if (word) { result.push({ type: 'word', value: word.toLowerCase() }); i += word.length; continue }
        result.push({ type: 'symbol', value: c }); i++
    }
    return result
}

function inspectSql(input, values) {
    let sql = typeof input === 'string' ? input : input?.sql
    // This metadata template is emitted by Knex hasTable. Only fixture names
    // and our fixed current database are accepted; no generic catalog access.
    if (sql === 'select * from information_schema.tables where table_name = ? and table_schema = database()') {
        ensure(Array.isArray(values) && values.length === 1 && names.includes(values[0]))
        return { kind: 'metadata', tables: [], sql: driver.format(sql, values) }
    }
    sql = driver.format(sql, values)
    const list = tokens(sql)
    if (list.at(-1)?.value === ';') list.pop()
    ensure(list.length && !list.some(token => token.value === ';'))
    const kind = list[0].value
    if (['begin', 'commit', 'rollback'].includes(kind)) {
        ensure(list.length === 1); return { kind, tables: [], sql }
    }
    if (kind === 'start') {
        ensure(list.length === 2 && list[1].value === 'transaction'); return { kind: 'begin', tables: [], sql }
    }
    ensure(['select', 'insert', 'update', 'delete'].includes(kind))
    if (kind === 'insert') ensure(list[1]?.value === 'into')
    if (kind === 'delete') ensure(list[1]?.value === 'from')
    ensure(!list.some(t => t.type === 'word' && ['table', 'union', 'outfile', 'infile', 'procedure', 'load_file', 'sleep', 'benchmark', 'get_lock'].includes(t.value)))
    const touched = []
    for (let i = 0; i < list.length; i++) {
        const token = list[i]
        if (token.type !== 'word' || !(['from', 'join', 'into'].includes(token.value) || i === 0 && token.value === 'update')) continue
        let target = list[++i]
        ensure(target && ['word', 'identifier'].includes(target.type))
        let name = target.value
        if (list[i + 1]?.value === '.') {
            ensure(name === TARGET)
            target = list[i + 2]; ensure(target && ['word', 'identifier'].includes(target.type))
            name = target.value; i += 2
        }
        ensure(names.includes(name))
        const following = list[i + 1]
        if (token.value === 'update') ensure(following?.value === 'set')
        else if (token.value === 'into') ensure(following && ['(', 'values'].includes(following.value))
        else ensure(!following || ['where', 'order', 'limit', 'for'].includes(following.value))
        touched.push(name)
    }
    // Authentication queries never join or have more than one table source.
    ensure(touched.length === 1)
    return { kind, tables: touched, sql }
}

function guardConnection(connection, audit) {
    const original = connection.query
    connection.query = function (input, values, callback) {
        if (typeof values === 'function') { callback = values; values = undefined }
        try {
            const checked = inspectSql(input, values)
            audit.push({ kind: checked.kind, tables: checked.tables })
            const options = typeof input === 'object' ? { ...input, sql: checked.sql } : { sql: checked.sql }
            return original.call(this, options, callback)
        } catch (error) {
            audit.push({ kind: 'blocked', tables: [] })
            if (typeof callback !== 'function') throw error
            process.nextTick(() => callback(Object.assign(new Error('Fixture SQL refused'), { code: 'E2B_FIXTURE_SQL_REFUSED' })))
        }
    }
}

function accountFacade(base, transactionHook = async value => value) {
    const facade = table => { ensure(table === 'users2'); return base(fixtures.users2) }
    facade.raw = (...args) => base.raw(...args)
    facade.client = base.client
    facade.transaction = callback => base.transaction(async trx => transactionHook(await callback(accountFacade(trx))))
    return facade
}

module.exports = { fixtures, names, ensure, tokens, inspectSql, guardConnection, accountFacade }
