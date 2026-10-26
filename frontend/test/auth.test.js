import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import axios from 'axios'
import { installAuthClient } from '../src/plugins/authClient.js'
import { Vue, memoryDocument, installDocumentGlobals, flush, walk } from './helpers/form-harness.js'

const require = createRequire(import.meta.url)
const Pinia = require('pinia')
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
const { transformSync } = require('esbuild')
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const identity = { id: 2, name: 'Avaliador fictício', email: 'reviewer@example.invalid', admin: false }
const secret = 'synthetic-password-for-tests'
const token = 'a'.repeat(64)
const deferred = () => {
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}
const failure = status => ({ response: { status, data: 'synthetic private API diagnostic' } })

function stores(t, behavior = {}) {
    const calls = []
    const subscribers = new Set()
    const api = {
        async get(url) { calls.push({ method: 'GET', url }); return behavior.get ? behavior.get(url) : { data: identity } },
        async post(url, data) { calls.push({ method: 'POST', url, data }); return behavior.post ? behavior.post(url, data) : { data: identity } }
    }
    const modules = new Map()
    function load(file) {
        if (modules.has(file)) return modules.get(file)
        const module = { exports: {} }
        const source = fs.readFileSync(file, 'utf8')
        const code = transformSync(source, { format: 'cjs', target: 'es2020' }).code
        vm.runInNewContext(code, {
            module, exports: module.exports,
            require(name) {
                if (name === 'vue') return Vue
                if (name === 'pinia') return Pinia
                if (name === 'vue3-toastify') return { toast: { error() {} } }
                if (name === '@/plugins/axios.js') return {
                    __esModule: true, default: api, clearCsrf() {},
                    onUnauthorized(listener) { subscribers.add(listener); return () => subscribers.delete(listener) }
                }
                const dependency = name.startsWith('@/') ? path.resolve(frontend, 'src', name.slice(2)) : path.resolve(path.dirname(file), name)
                assert.ok(dependency.startsWith(path.join(frontend, 'src') + path.sep), 'Unexpected external dependency')
                return load(dependency)
            }
        }, { filename: file, timeout: 1000 })
        modules.set(file, module.exports)
        return module.exports
    }
    const pinia = Pinia.createPinia()
    Pinia.setActivePinia(pinia)
    const auth = load(path.join(frontend, 'src/stores/authStore.js')).useAuthStore(pinia)
    const colabs = load(path.join(frontend, 'src/stores/colabStore.js')).useColabStore(pinia)
    const legacy = load(path.join(frontend, 'src/js/store.js'))
    t.after(() => { auth.$dispose(); colabs.$dispose() })
    return { auth, colabs, legacy, calls, unauthorized() { for (const listener of subscribers) listener() } }
}

test('auth store shares one session lookup and replaces legacy fixed identity from server data', async t => {
    const pending = deferred()
    const state = stores(t, { get: () => pending.promise })
    assert.equal(state.legacy.dados.email, '')
    const first = state.auth.restore(); const second = state.auth.restore()
    pending.resolve({ data: identity })
    await Promise.all([first, second])
    assert.equal(state.calls.length, 1)
    assert.equal(state.auth.user.id, identity.id)
    assert.equal(state.legacy.dados.email, identity.email)
    assert.equal(state.legacy.dados.admin, false)
})

test('old session and collaborator responses cannot restore data after logout or identity replacement', async t => {
    const session = deferred(); const collaborators = deferred()
    const state = stores(t, { get: url => url === '/session' ? session.promise : collaborators.promise })
    const pendingSession = state.auth.restore()
    const pendingColabs = state.colabs.loadColabs()
    assert.equal(await state.auth.signin(identity.email, secret), true)
    session.resolve({ data: { ...identity, id: 99 } })
    collaborators.resolve({ data: [{ id: 1, colab: 'Profissional de sessão antiga' }] })
    await Promise.all([pendingSession, pendingColabs])
    assert.equal(state.auth.user.id, identity.id)
    assert.equal(state.colabs.colabs.length, 0)
    state.colabs.chkColabs = ['Profissional fictício']
    state.unauthorized()
    assert.equal(state.auth.user, null)
    assert.equal(state.colabs.chkColabs.length, 0)
    assert.equal(state.legacy.dados.email, '')
})

test('login and service errors show generic messages without storing API diagnostics', async t => {
    for (const status of [401, 403, 429, 503]) {
        const state = stores(t, { post: async () => { throw failure(status) } })
        assert.equal(await state.auth.signin(identity.email, secret), false)
        assert.equal(state.auth.user, null)
        assert.equal(state.auth.busy, false)
        assert.equal(state.auth.error.includes('private'), false)
        assert.ok(state.auth.error.length > 0)
    }
})

test('failed logout preserves identity for retry; confirmed logout clears private state', async t => {
    let rejectLogout = true
    const state = stores(t, { post: async url => {
        if (url === '/signout' && rejectLogout) throw failure(503)
        return { data: identity }
    } })
    await state.auth.signin(identity.email, secret)
    state.colabs.colabs = [{ colab: 'Profissional fictício' }]
    assert.equal(await state.auth.signout(), false)
    assert.equal(state.auth.user.id, identity.id)
    rejectLogout = false
    assert.equal(await state.auth.signout(), true)
    assert.equal(state.auth.user, null)
    assert.equal(state.colabs.colabs.length, 0)
})

test('password change does not clear a valid session on an incorrect current password', async t => {
    const state = stores(t, { post: async url => {
        if (url === '/change-password') throw failure(401)
        return { data: identity }
    } })
    await state.auth.signin(identity.email, secret)
    assert.equal(await state.auth.changePassword('wrong', secret + '-new'), false)
    assert.equal(state.auth.user.id, identity.id)
    assert.equal(state.auth.error.includes('não foi alterada'), true)
})

function client(adapter) {
    const api = axios.create({ baseURL: 'https://api.example.invalid', withCredentials: true, adapter })
    const controls = installAuthClient(api)
    return { api, controls }
}
const response = (config, data = {}) => ({ status: 200, statusText: 'OK', headers: {}, config, data })

test('Axios obtains CSRF once for concurrent mutations and sends JSON with credentials', async () => {
    const calls = []
    const { api } = client(async config => {
        calls.push(config)
        return response(config, config.url === '/csrf-token' ? { csrfToken: token } : {})
    })
    await Promise.all([api.post('/colab', { colab: 'Profissional fictício' }), api.delete('/registros/1')])
    assert.equal(calls.filter(call => call.url === '/csrf-token').length, 1)
    const mutations = calls.filter(call => call.method !== 'get')
    assert.equal(mutations.length, 2)
    for (const config of mutations) {
        assert.equal(config.headers['X-CSRF-Token'], token)
        assert.equal(config.headers['Content-Type'], 'application/json')
        assert.equal(config.withCredentials, true)
    }
    assert.deepEqual(JSON.parse(mutations.find(call => call.method === 'delete').data), {})
})

test('Axios never automatically replays a failed mutation', async () => {
    let writes = 0
    const { api } = client(async config => {
        if (config.url === '/csrf-token') return response(config, { csrfToken: token })
        writes++
        throw { ...failure(403), config }
    })
    await assert.rejects(api.post('/registros', { colab: 'Profissional fictício' }))
    assert.equal(writes, 1)
})

test('obsolete CSRF responses cannot authorize a mutation after the session changes', async () => {
    const pending = deferred()
    let writes = 0
    const { api, controls } = client(async config => {
        if (config.url === '/csrf-token') return response(config, await pending.promise)
        writes++; return response(config)
    })
    const request = api.post('/colab', {})
    await new Promise(resolve => setImmediate(resolve))
    controls.clearCsrf()
    pending.resolve({ csrfToken: token })
    await assert.rejects(request)
    assert.equal(writes, 0)
})

test('401 from business requests invalidates identity while authentication failures remain local', async () => {
    let notifications = 0
    const { api, controls } = client(async config => {
        if (config.url === '/csrf-token') return response(config, { csrfToken: token })
        throw { ...failure(401), config }
    })
    controls.onUnauthorized(() => { notifications++ })
    await assert.rejects(api.post('/signin', { email: identity.email, password: secret }))
    assert.equal(notifications, 0)
    await assert.rejects(api.get('/registros'))
    assert.equal(notifications, 1)
})

async function page(t, name, auth) {
    const { document, renderer, create } = memoryDocument()
    const restoreDocument = installDocumentGlobals(document)
    const filename = path.join(frontend, 'src/components/pages', name + '.vue')
    const { descriptor } = parse(fs.readFileSync(filename, 'utf8'), { filename })
    const script = compileScript(descriptor, { id: filename })
    const template = compileTemplate({ id: filename, filename, source: descriptor.template.content,
        compilerOptions: { bindingMetadata: script.bindings, hoistStatic: false } })
    assert.deepEqual(template.errors, [])
    const navigations = []
    function evaluate(source) {
        const module = { exports: {} }
        vm.runInNewContext(transformSync(source, { format: 'cjs', target: 'es2020' }).code, {
            module, exports: module.exports,
            require(name) {
                if (name === 'vue') return Vue
                if (name === 'vue-router') return { useRouter: () => ({ async replace(value) { navigations.push(value) } }), useRoute: () => ({ query: {} }) }
                assert.equal(name, '@/stores/authStore.js')
                return { useAuthStore: () => auth }
            }
        }, { filename, timeout: 1000 })
        return module.exports
    }
    const component = evaluate(script.content).default
    component.render = evaluate(template.code).render
    const root = create('root'); document.body.append(root)
    const app = renderer.createApp(component); app.mount(root)
    const state = app._instance.setupState
    t.after(() => { app.unmount(); restoreDocument() })
    await flush()
    return { root, state, navigations, app, element: id => walk(root).find(node => node.id === id) }
}

test('login UI has associated labels, keeps entries on failure, disables pending submissions and clears passwords on exit', async t => {
    const pending = deferred()
    const auth = Vue.reactive({ busy: false, error: '', async signin(email, password) {
        assert.equal(email, identity.email); assert.equal(password, secret)
        auth.busy = true
        const result = await pending.promise
        auth.error = 'E-mail ou senha inválidos.'; auth.busy = false
        return result
    } })
    const form = await page(t, 'Login', auth)
    for (const id of ['login-email', 'login-password']) {
        assert.ok(walk(form.root).some(node => node.tag === 'label' && node.props.for === id))
    }
    form.element('login-email').value = identity.email; form.element('login-email').dispatch('input')
    form.element('login-password').value = secret; form.element('login-password').dispatch('input')
    const submit = form.state.submit(); await flush()
    assert.equal(walk(form.root).find(node => node.tag === 'button').props.disabled, true)
    pending.resolve(false); await submit; await flush()
    assert.equal(form.state.email, identity.email)
    assert.equal(form.state.password, secret)
    assert.ok(walk(form.root).some(node => node.props.role === 'alert' && node.text.includes('inválidos')))
    form.app.unmount()
    assert.equal(form.state.password, '')
})

test('password UI validates confirmation before posting and returns to login after success', async t => {
    let calls = 0
    const auth = Vue.reactive({ busy: false, error: '', async changePassword() { calls++; return true } })
    const form = await page(t, 'ChangePassword', auth)
    form.state.currentPassword = secret
    form.state.newPassword = secret + '-new'
    form.state.confirmation = 'mismatch'
    await form.state.submit()
    assert.equal(calls, 0)
    form.state.confirmation = form.state.newPassword
    await form.state.submit()
    assert.equal(calls, 1)
    assert.equal(form.navigations[0].name, 'Login')
    assert.equal(form.navigations[0].query.passwordChanged, '1')
})
