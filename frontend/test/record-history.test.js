import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import { buildMonthlyHistory, filterRecords, formatRecordDate, periodError, recordDate, displayValue } from '../src/components/utils/record-history.js'
import { mountForm, Vue, flush, walk } from './helpers/form-harness.js'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const record = (id, colab_id, created_at, values = {}) => ({ id, colab_id, colab: 'Homônimo fictício', created_at,
    avaliacao: '4.5', nota_qualidade: '4.5', nota_prazo: '4.5', nota_dispon: '4.5', nota_respon: '4.5',
    ...values })
function page(api) {
    const filename = 'src/components/pages/Registros.vue'
    const { descriptor } = parse(fs.readFileSync(path.join(frontend, filename), 'utf8'))
    const module = { exports: {} }
    vm.runInNewContext(descriptor.script.content.replace(/^import .*$/gm, '').replace('export default ', 'module.exports = '), {
        module, axios: api, toast: { error() {}, success() {} }, dados: { admin: true },
        ManagementPage: {}, Excel: {}, ConfirmDeleteModal: {}, ProfessionalHistoryModal: {}, Vue3EasyDataTable: {},
        filterRecords, formatRecordDate, periodError,
    }, { filename, timeout: 1000 })
    const options = module.exports, instance = { ...options.data() }
    for (const [key, method] of Object.entries(options.methods)) instance[key] = method.bind(instance)
    for (const [key, getter] of Object.entries(options.computed)) Object.defineProperty(instance, key, { get: getter.bind(instance) })
    return { instance, options }
}
function deferred() {
    let resolve, reject
    const promise = new Promise((complete, fail) => { resolve = complete; reject = fail })
    return { promise, resolve, reject }
}

test('period search includes both endpoints and combines text, formatted dates and open bounds without mutating source dates', () => {
    const records = [record(1, 1, '2026-09-30T23:59:59.000Z'), record(2, 1, '2026-10-01T00:00:00.000Z'),
        record(3, 1, '2026-10-31T23:59:59.999Z', { obs_qualidade: 'Atenção no atendimento' }), record(4, 1, '2026-11-01T00:00:00.000Z'), record(5, 1, null)]
    const before = structuredClone(records)
    const fields = ['created_at', 'obs_qualidade', 'colab']
    assert.deepEqual(filterRecords(records, '2026-10-01', '2026-10-31', '', fields).map(row => row.id), [2, 3])
    assert.deepEqual(filterRecords(records, '', '2026-10-01', '', fields).map(row => row.id), [1, 2])
    assert.deepEqual(filterRecords(records, '2026-11-01', '', '', fields).map(row => row.id), [4])
    assert.deepEqual(filterRecords(records, '2026-10-01', '2026-10-31', 'atencao', fields).map(row => row.id), [3])
    assert.deepEqual(filterRecords(records, '', '', '31/10/2026', fields).map(row => row.id), [3])
    assert.deepEqual(filterRecords(records, '', '', '', fields), records)
    assert.deepEqual(records, before)
})

test('invalid periods, leap-day dates and missing dates are handled without inventing dates or values', () => {
    assert.ok(periodError('2026-11-01', '2026-10-01'))
    assert.ok(periodError('2026-02-29', ''))
    assert.equal(periodError('2028-02-29', '2028-02-29'), '')
    assert.equal(recordDate('2026-04-31'), null)
    assert.equal(recordDate('not-a-date'), null)
    assert.equal(recordDate('2026-01-01junk'), null)
    assert.deepEqual(filterRecords([record(1, 1, '2026-10-01')], '2026-11-01', '2026-10-01'), [])
    assert.equal(formatRecordDate(null), 'Data não informada')
    assert.equal(formatRecordDate('2026-10-01T01:23:45.000Z', true), '01/10/2026 às 01:23:45 (UTC)')
    assert.equal(displayValue(null), 'Não informado')
    assert.equal(displayValue('<script>synthetic</script>'), '<script>synthetic</script>')
})

test('monthly series separate years, preserve missing months as gaps and average legacy duplicates transparently', () => {
    const records = [record(1, 1, '2026-12-01', { nota_qualidade: '3', avaliacao: '3.125' }),
        record(2, 1, '2026-12-31', { nota_qualidade: '5', avaliacao: '4.5' }),
        record(3, 1, '2027-02-01', { nota_respon: null }), record(4, 1, null),
        record(5, 1, '2027-03-01', { nota_prazo: 'bad', nota_dispon: '', nota_qualidade: '0' })]
    const before = structuredClone(records), series = buildMonthlyHistory(records)
    assert.deepEqual(series.map(month => month.month), ['2026-12', '2027-02', '2027-03'])
    assert.equal(series[1].ordinal - series[0].ordinal, 2)
    assert.equal(series[0].count, 2)
    assert.equal(series[0].nota_qualidade, 4)
    assert.equal(series[0].avaliacao, 3.8125)
    assert.equal(series[1].nota_respon, null)
    assert.equal(series[2].nota_prazo, null)
    assert.equal(series[2].nota_dispon, null)
    assert.equal(series[2].nota_qualidade, null)
    assert.deepEqual(records, before)
})

test('clicking a professional refreshes authorization and shows their complete ID-linked history independently of table filters', async () => {
    const records = [record(1, 1, '2026-09-01'), record(2, 2, '2026-10-01'), record(3, 1, '2026-10-20'), record(4, null, '2026-10-20')]
    let requests = 0
    const { instance } = page({ async get(url) { requests++; assert.equal(url, '/registros'); return { data: records } } })
    await instance.loadRegs()
    instance.startDate = '2026-10-01'; instance.endDate = '2026-10-31'; instance.searchValue = '20/10/2026'
    assert.deepEqual(Array.from(instance.filteredRecords, row => row.id), [3, 4])
    await instance.openHistory(records[2])
    assert.equal(requests, 2)
    assert.equal(instance.showHistory, true)
    assert.equal(instance.historyId, 1)
    assert.deepEqual(Array.from(instance.historyRecords, row => row.id), [1, 3])
    assert.equal(instance.hasProfessionalId(records[3]), false)
    assert.equal(instance.openHistory(records[3]), undefined)
    instance.clearFilters()
    assert.equal(instance.filteredRecords.length, 4)
})

test('history clears detailed content after an authorization change or failed refresh and ignores responses after unmount', async () => {
    let rows = [record(1, 1, '2026-10-01')], fail = false
    const { instance, options } = page({ async get() { if (fail) throw new Error('private detail'); return { data: rows } } })
    const previous = rows[0]
    await instance.loadRegs()
    rows = []
    await instance.openHistory(previous)
    assert.equal(instance.historyRecords.length, 0)
    assert.equal(instance.historyError, '')
    rows = [previous]; await instance.openHistory(previous)
    fail = true; await instance.refreshHistory()
    assert.equal(instance.historyRecords.length, 0)
    assert.ok(instance.historyError)
    const pending = deferred()
    const other = page({ get() { return pending.promise } })
    const load = other.instance.loadRegs()
    other.options.beforeUnmount.call(other.instance)
    pending.resolve({ data: [previous] }); await load
    assert.equal(other.instance.registros.length, 0)
    assert.equal(typeof options.beforeUnmount, 'function')
})

test('out-of-order history refreshes never restore the previous professional or stale rows', async () => {
    const first = deferred(), second = deferred()
    let requests = 0
    const { instance } = page({ get() { return ++requests === 1 ? first.promise : second.promise } })
    const one = instance.openHistory(record(1, 1, '2026-10-01'))
    const two = instance.openHistory(record(2, 2, '2026-10-01'))
    second.resolve({ data: [record(2, 2, '2026-10-01')] }); await two
    first.resolve({ data: [record(1, 1, '2026-10-01')] }); await one
    assert.equal(instance.historyId, 2)
    assert.deepEqual(Array.from(instance.historyRecords, row => row.id), [2])
})

test('real Vue/Flowbite history modal renders stored details as text, chart/table, keyboard close and focus restoration', async t => {
    const props = Vue.reactive({ modelValue: false, professionalName: 'Profissional fictício', professionalId: 1,
        records: [record(1, 1, '2026-10-01T12:00:00Z', { obs_qualidade: '<script>private fixture</script>',
            itensQualidade: 'Critério fictício', liderancas: 'Liderança fictícia', demandante: 'reviewer@example.invalid',
            updated_at: '2026-10-02T12:00:00Z', nivel: 'A', desconto: '0%' }), record(2, 1, '2026-10-20T12:00:00Z')],
        'onUpdate:modelValue': value => { props.modelValue = value } })
    const ui = await mountForm(t, { componentFile: 'src/components/utils/ProfessionalHistoryModal.vue', props })
    const trigger = ui.document.createElement('button'); ui.document.body.append(trigger); trigger.focus()
    props.modelValue = true; await flush()
    assert.equal(ui.modal('professional-history-modal').isVisible(), true)
    const nodes = walk(ui.document.body)
    const text = nodes.map(node => node.text).join(' ')
    for (const value of ['<script>private fixture</script>', 'Critério fictício', 'Liderança fictícia', 'reviewer@example.invalid',
        'Qualidade', 'Prazo', 'Disponibilidade', 'Responsabilidade', 'Há meses com mais de uma avaliação antiga', 'Médias das notas']) assert.ok(text.includes(value), value)
    assert.equal(nodes.some(node => node.tag === 'script'), false)
    assert.ok(nodes.some(node => node.tag === 'svg' && node.props.role === 'img'))
    const legend = nodes.find(node => node.tag === 'button' && node.props['aria-pressed'] === true)
    assert.ok(legend)
    const before = nodes.filter(node => node.tag === 'circle').length
    legend.dispatch('click'); await flush()
    assert.ok(walk(ui.document.body).filter(node => node.tag === 'circle').length < before)
    const modalElement = ui.element('professional-history-modal')
    const close = walk(modalElement).find(node => node.tag === 'button' && node.props['aria-label'] === 'Fechar histórico')
    const summary = walk(modalElement).find(node => node.tag === 'summary')
    close.focus()
    assert.equal(modalElement.dispatch('keydown', { key: 'Tab', shiftKey: true }).defaultPrevented, true)
    assert.equal(ui.document.activeElement, summary)
    assert.equal(modalElement.dispatch('keydown', { key: 'Tab' }).defaultPrevented, true)
    assert.equal(ui.document.activeElement, close)
    ui.document.body.dispatch('keydown', { key: 'Escape' }); await flush()
    assert.equal(props.modelValue, false)
    assert.equal(ui.document.activeElement, trigger)
    ui.visible.value = false; await flush()
    assert.equal(ui.instanceCount(), 0)
})
