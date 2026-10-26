import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const user = { admin: false, email: 'reviewer@example.invalid' }

// Evaluate the real Options API methods with synthetic identity, HTTP and toast
// bindings. Imports are removed so no browser, actual user store or service loads.
function page(name, axios, identity = user) {
    const filename = `src/components/pages/${name}.vue`
    const { descriptor } = parse(fs.readFileSync(path.join(frontend, filename), 'utf8'), { filename })
    const notifications = []
    const toast = Object.fromEntries(['success', 'error'].map(type => [type,
        message => notifications.push({ type, message })]))
    const module = { exports: {} }
    vm.runInNewContext(descriptor.script.content.replace(/^import .*$/gm, '')
        .replace('export default ', 'module.exports = '), {
        module, axios, toast, dados: identity, Vue3EasyDataTable: {},
        Excel: {}, ConfirmDeleteModal: {}, exportFromJSON: {}, excelParser: () => ({})
    }, { filename, timeout: 1000 })
    const options = module.exports
    const instance = { ...options.data() }
    for (const [name, method] of Object.entries(options.methods)) instance[name] = method.bind(instance)
    return { instance, notifications }
}

function deferred() {
    let resolve, reject
    const promise = new Promise((complete, fail) => { resolve = complete; reject = fail })
    return { promise, resolve, reject }
}

for (const [name, method, fields, endpoint] of [
    ['Colabs', 'loadColabs', ['colabs'], '/colab'],
    ['Registros', 'loadRegs', ['registros', 'colabcUser'], '/registros'],
    ['Excel', 'loadRegs', ['listData', 'colabcUser'], '/registros']
]) {
    test(`${name}: failed loading preserves existing data and shows a generic error`, async () => {
        const { instance, notifications } = page(name, {
            async get(url) {
                assert.equal(url, endpoint)
                throw new Error('synthetic private API detail')
            }
        })
        const rows = [{ id: 1, colab: 'Profissional fictício' }]
        for (const field of fields) instance[field] = rows
        await instance[method]()
        for (const field of fields) assert.equal(instance[field], rows)
        assert.equal(notifications.length, 1)
        assert.equal(notifications[0].type, 'error')
        assert.equal(notifications[0].message.includes('private'), false)
    })
}

for (const [name, selectedId, fields, endpoint] of [
    ['Colabs', 'colabId', ['colabs'], '/colab/1'],
    ['Registros', 'regId', ['registros', 'colabcUser'], '/registros/1']
]) {
    for (const success of [true, false]) {
        test(`${name}: deletion ${success ? 'updates after confirmation using the requested ID' : 'preserves all lists on failure'}`, async () => {
            const request = deferred()
            const { instance, notifications } = page(name, {
                delete(url) { assert.equal(url, endpoint); return request.promise }
            })
            const rows = [{ id: 1, colab: 'Profissional A' }, { id: 2, colab: 'Profissional B' }]
            for (const field of fields) instance[field] = rows
            instance[selectedId] = 1
            const pending = instance.deleteItem()
            for (const field of fields) assert.equal(instance[field], rows)
            assert.equal(notifications.length, 0)
            instance[selectedId] = 2
            if (success) request.resolve({ status: 204 })
            else request.reject(new Error('synthetic private API detail'))
            await pending
            for (const field of fields) {
                if (success) assert.deepEqual(Array.from(instance[field], row => row.id), [2])
                else assert.equal(instance[field], rows)
            }
            assert.equal(notifications.length, 1)
            assert.equal(notifications[0].type, success ? 'success' : 'error')
        })
    }
}

test('Registros: successful load preserves filtering and date presentation', async () => {
    const rows = [
        { id: 1, demandante: user.email, created_at: '2026-10-25T12:00:00.000Z' },
        { id: 2, demandante: 'another@example.invalid', created_at: '2026-10-24T12:00:00.000Z' }
    ]
    const { instance, notifications } = page('Registros', { async get() { return { data: rows } } })
    await instance.loadRegs()
    assert.deepEqual(Array.from(instance.colabcUser, row => row.id), [1])
    assert.equal(instance.registros[0].created_at, '25/10/2026')
    assert.equal(notifications.length, 0)
})

for (const success of [true, false]) {
    test(`Inserir: ${success ? 'resets only after successful registration' : 'keeps entered data when registration fails'}`, async () => {
        const request = deferred()
        let submitted
        const { instance, notifications } = page('Inserir', {
            post(url, data) { assert.equal(url, '/colab'); submitted = { ...data }; return request.promise }
        })
        Object.assign(instance.postData, { colab: 'Profissional fictício', matricula: 'TEST', demandante: user.email })
        const snapshot = { ...instance.postData }
        const pending = instance.save()
        assert.deepEqual({ ...instance.postData }, snapshot)
        assert.deepEqual(submitted, snapshot)
        assert.equal(notifications.length, 0)
        if (success) request.resolve({ status: 204 })
        else request.reject(new Error('synthetic private API detail'))
        await pending
        if (success) assert.equal(Object.values(instance.postData).every(value => value === ''), true)
        else assert.deepEqual({ ...instance.postData }, snapshot)
        assert.equal(notifications.length, 1)
        assert.equal(notifications[0].type, success ? 'success' : 'error')
    })
}

test('collaborator store: failed loading preserves the list and selection without logging API details', async () => {
    const filename = 'src/stores/colabStore.js'
    const notifications = []
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(path.join(frontend, filename), 'utf8')
        .replace(/^import .*$/gm, '').replace('export const useColabStore = ', 'module.exports = '), {
        module,
        defineStore: (name, setup) => setup,
        ref: value => ({ value }),
        axios: { async get() { throw new Error('synthetic private API detail') } },
        toast: { error(message) { notifications.push(message) } },
        console: { error() { assert.fail('Raw API errors must not be logged') } }
    }, { filename, timeout: 1000 })
    const store = module.exports()
    const rows = [{ id: 1, colab: 'Profissional fictício' }]
    store.colabs.value = rows
    store.chkColabs.value = ['Profissional fictício']
    await store.loadColabs()
    assert.equal(store.colabs.value, rows)
    assert.deepEqual(store.chkColabs.value, ['Profissional fictício'])
    assert.deepEqual(notifications, ['Não foi possível carregar os profissionais.'])
})
