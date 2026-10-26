const assert = require('node:assert/strict')
const test = require('node:test')
const validation = require('../lib/business-validation')
const { validEvaluation } = require('./helpers/evaluation-fixture')
const { harness, email } = require('./helpers/auth-harness')

test('evaluation classification preserves the existing boundary bands and fractional averages', () => {
    for (const [notes, average, nivel, desconto] of [
        [[5, 5, 4.5, 4.5], 4.75, 'A', '0%'], [[4.5, 4.5, 4.5, 4.5], 4.5, 'A', '0%'],
        [[4.5, 4.5, 4.5, 4], 4.375, 'B', '1%'], [[4, 4, 4, 4], 4, 'B', '1%'],
        [[4, 4, 4, 3.5], 3.875, 'C', '2%'], [[3.5, 3.5, 3.5, 3.5], 3.5, 'C', '2%'],
        [[3.5, 3.5, 3.5, 3], 3.375, 'D', '3%'], [[2.5, 2.5, 2.5, 2.5], 2.5, 'D', '3%'],
        [[2.5, 2.5, 2.5, 2], 2.375, 'E', '5%'], [[1, 1, 1, 1], 1, 'E', '5%']
    ]) for (const strings of [false, true]) {
        const body = validEvaluation({ avaliacao: strings ? String(average) : average, nivel, desconto,
            itensQualidade: 'Critério fictício', itensDispon: 'Critério fictício' })
        for (const [index, key] of ['qualidade', 'prazo', 'dispon', 'respon'].entries()) {
            body['nota_' + key] = strings ? String(notes[index]) : notes[index]
        }
        const result = validation.evaluation(body)
        assert.ok(result)
        assert.equal(result.avaliacao, String(average))
        assert.equal(result.nivel, nivel)
        assert.equal(result.desconto, desconto)
    }
})

test('schema text limits count Unicode characters without truncation and preserve optional nulls', () => {
    const maximum = '😀'.repeat(255)
    const person = validation.professional({ colab: maximum, demandante: ' Reviewer@Example.Invalid ', matricula: null })
    assert.deepEqual(person, { colab: maximum, demandante: email, matricula: null })
    assert.equal(validation.evaluation(validEvaluation({ obs_qualidade: maximum })).obs_qualidade, maximum)
    assert.equal(validation.evaluation(validEvaluation({ obs_qualidade: maximum + 'x' })), null)
    assert.equal(validation.professional({ colab: maximum + 'x', demandante: email }), null)
    for (const field of ['matricula', 'ppu', 'servico', 'funcao', 'liderancas', 'gerencia']) {
        for (const value of [false, 7, [], {}, maximum + 'x']) {
            assert.equal(validation.professional({ colab: 'Fictício', demandante: email, [field]: value }), null)
        }
    }
})

test('evaluation rejects missing, malformed, inconsistent and low-rating-without-criteria payloads', () => {
    for (const value of [undefined, null, [], true, 5, 'text', new Date(), {}]) assert.equal(validation.evaluation(value), null)
    for (const field of ['colab', 'avaliacao', 'nivel', 'desconto', 'nota_qualidade', 'obs_qualidade',
        'nota_prazo', 'obs_prazo', 'nota_dispon', 'obs_dispon', 'nota_respon', 'obs_respon']) {
        const body = validEvaluation(); delete body[field]
        assert.equal(validation.evaluation(body), null, field)
    }
    for (const value of [0, -1, 6, 4.25, true, [], {}, null, '5x', '5e0', ' 5 ', '5.00000000000000001']) {
        assert.equal(validation.evaluation(validEvaluation({ nota_qualidade: value })), null)
    }
    for (const changes of [{ avaliacao: '4' }, { nivel: 'B' }, { desconto: '1%' }, { itensQualidade: [] },
        { itensDispon: {} }, { liderancas: 9 }, { obs_prazo: null }, { colab: '   ' }]) {
        assert.equal(validation.evaluation(validEvaluation(changes)), null)
    }
    const low = validEvaluation({ nota_qualidade: 3, nota_prazo: 3, nota_dispon: 3, nota_respon: 3,
        avaliacao: 3, nivel: 'D', desconto: '3%' })
    assert.equal(validation.evaluation(low), null)
    assert.ok(validation.evaluation({ ...low, itensQualidade: 'Qualidade fictícia', itensDispon: 'Disponibilidade fictícia' }))
})

test('pagination and route IDs reject coercion, repeated parameters and unsafe offsets', () => {
    assert.deepEqual(validation.pagination(), { page: 1, limit: 25, offset: 0 })
    assert.deepEqual(validation.pagination({ page: '2', limit: '100' }), { page: 2, limit: 100, offset: 100 })
    for (const value of ['', '0', '-1', '1.5', '2x', '1e2', '01', [], {}, true, null, '9007199254740992']) {
        assert.equal(validation.pagination({ page: value }), null)
        assert.equal(validation.id(value), null)
    }
    assert.equal(validation.pagination({ page: String(Number.MAX_SAFE_INTEGER), limit: '100' }), null)
    assert.equal(validation.pagination({ limit: '101' }), null)
    assert.equal(validation.id('4294967295'), 4294967295)
    assert.equal(validation.id('4294967296'), null)
})

test('invalid HTTP payloads fail before business queries or writes, while authorization stays enforced', async t => {
    const app = await harness(t)
    const reviewer = app.client(); await reviewer.login()
    const token = await reviewer.csrf()
    const writes = app.state.writes.length
    const businessQueries = () => app.state.queries.filter(query => ['colab', 'registros'].includes(query.table)).length
    const beforeQueries = businessQueries()
    for (const endpoint of ['/registros', '/registros2']) {
        for (const body of [null, [], {}, validEvaluation({ nota_respon: 4.25 }),
            validEvaluation({ avaliacao: '1' }), validEvaluation({ itensDispon: ['invalid format'] }),
            validEvaluation({ obs_prazo: 'x'.repeat(256) })]) {
            const result = await reviewer.request('POST', endpoint, body, { 'X-CSRF-Token': token })
            assert.equal(result.status, 400)
            assert.equal(result.text, body === null ? 'Requisição inválida.' : 'Dados de avaliação inválidos.')
        }
    }
    for (const query of ['page=-1', 'limit=101', 'page=2x', 'page=1&page=2', 'page[x]=1', 'limit=0']) {
        assert.equal((await reviewer.request('GET', '/registros2?' + query)).status, 400)
    }
    assert.equal(businessQueries(), beforeQueries)
    assert.equal(app.state.writes.length, writes)
    const list = await reviewer.request('GET', '/registros2')
    assert.equal(list.status, 200)
    assert.deepEqual(list.json().map(row => row.colab), ['Profissional A'])
    for (let index = 0; index < 50; index++) app.state.tables.registros.push({ id: index + 100, colab_id: 1, colab: 'Profissional A', demandante: email })
    const first = (await reviewer.request('GET', '/registros2')).json()
    const second = (await reviewer.request('GET', '/registros2?page=2')).json()
    const last = (await reviewer.request('GET', '/registros2?page=3')).json()
    assert.equal(first.length, 25)
    assert.equal(second.length, 25)
    assert.equal(last.length, 1)
    assert.equal(first.some(row => second.some(other => other.id === row.id)), false)
    assert.equal((await reviewer.request('POST', '/registros', validEvaluation({ colab: 'Profissional B' }), { 'X-CSRF-Token': token })).status, 403)
})

test('professional validation and ID guards preserve valid statuses and protect ignored columns', async t => {
    const app = await harness(t)
    const admin = app.client(); await admin.login('admin@example.invalid')
    const token = await admin.csrf()
    const originalRows = app.state.tables.colab.length
    for (const payload of [null, [], {}, { colab: '  ', demandante: email },
        { colab: 'Fictício', demandante: email, matricula: 123 }, { colab: 'Fictício', demandante: 'invalid' }]) {
        assert.equal((await admin.request('POST', '/colab', payload, { 'X-CSRF-Token': token })).status, 400)
    }
    for (const id of ['0', '-1', '1.5', '1x', '4294967296']) {
        for (const resource of ['/colab/', '/registros/']) for (const method of ['GET', 'DELETE']) {
            assert.equal((await admin.request(method, resource + id, {}, { 'X-CSRF-Token': token })).status, 400)
        }
    }
    assert.equal(app.state.writes.length, 0)
    assert.equal(app.state.tables.colab.length, originalRows)
    const saved = await admin.request('POST', '/colab', { colab: 'Novo fictício', demandante: ' REVIEWER@EXAMPLE.INVALID ',
        ppu: null, matricula: '123', id: 999, admin: true }, { 'X-CSRF-Token': token })
    assert.equal(saved.status, 204)
    const person = app.state.tables.colab.at(-1)
    assert.equal(person.demandante, email)
    assert.notEqual(person.id, 999)
    assert.equal(person.admin, undefined)
    assert.equal((await admin.request('GET', '/colab/4294967295')).status, 404)
    assert.equal((await admin.request('GET', '/registros/4294967295')).status, 404)
    assert.equal((await admin.request('DELETE', '/registros/4294967295', {}, { 'X-CSRF-Token': token })).status, 204)
})
