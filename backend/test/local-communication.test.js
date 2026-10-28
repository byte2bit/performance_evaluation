const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const axios = require('../../frontend/node_modules/axios/dist/node/axios.cjs')
const { parse } = require('../../frontend/node_modules/@vue/compiler-sfc')

const root = path.resolve(__dirname, '../..')
const source = file => fs.readFileSync(path.join(root, file), 'utf8')

function evaluate(file, code, bindings = {}) {
    const module = { exports: {} }
    vm.runInNewContext(code, {
        module,
        console: { log() {} },
        ...bindings
    }, { filename: file, timeout: 1000 })
    return module.exports
}

// Bootstrap dependencies are replaced so tests cannot load credentials,
// connect to MySQL, send mail, or open application ports.
function bootstrap(file, direct) {
    const listeners = []
    const middlewares = []
    const loads = []
    const db = () => { throw new Error('Database access is forbidden in this test') }
    const app = Object.assign(() => {}, {
        use(handler) { middlewares.push(handler); return this },
        listen(port) { listeners.push(port); return this }
    })
    const child = (req, res) => { res.dispatched = true }
    const module = { exports: {} }
    const consign = {
        include(name) { loads.push(name); return this },
        then(name) { loads.push(name); return this },
        into(target) { assert.equal(target, app) }
    }
    const modules = {
        express: () => app,
        consign: () => consign,
        './config/db': db,
        './index.js': child,
        http: { createServer(target) { assert.equal(target, app); return app } },
        vhost: require('vhost')
    }
    const requireStub = name => {
        assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`)
        return modules[name]
    }
    requireStub.main = direct ? module : {}
    vm.runInNewContext(source(file), {
        module, require: requireStub, console: { log() {} }
    }, { filename: file, timeout: 1000 })
    return { app: module.exports, listeners, middlewares, loads, db }
}

test('index.js opens only port 8001 when executed directly', () => {
    const result = bootstrap('backend/index.js', true)
    assert.deepEqual(result.listeners, [8001])
    assert.equal(result.app.db, result.db)
    assert.deepEqual(result.loads, [
        './config/passport.js', './config/middlewares.js',
        './api/validation.js', './api', './config/routes.js'
    ])
})

test('importing index.js does not open a port', () => {
    assert.deepEqual(bootstrap('backend/index.js', false).listeners, [])
})

test('api.js opens only port 8000 when executed directly', () => {
    assert.deepEqual(bootstrap('backend/api.js', true).listeners, [8000])
})

test('importing api.js does not open a port', () => {
    assert.deepEqual(bootstrap('backend/api.js', false).listeners, [])
})

test('Vhost forwards the configured host and passes unknown hosts to fallback', () => {
    const { middlewares } = bootstrap('backend/api.js', false)
    const configured = {}
    middlewares[0]({ headers: { host: 'api.mysite.com:8000' } }, configured, () => assert.fail('Unexpected fallback'))
    assert.equal(configured.dispatched, true)
    let fallback = false
    const unknown = {}
    middlewares[0]({ headers: { host: 'localhost:8000' } }, unknown, () => { fallback = true })
    assert.equal(unknown.dispatched, undefined)
    assert.equal(fallback, true)
})

function corsRequest(origin, method = 'OPTIONS', frontendOrigin) {
    const handlers = []
    const configure = evaluate('backend/config/middlewares.js', source('backend/config/middlewares.js'), {
        require,
        process: { env: { FRONTEND_ORIGIN: frontendOrigin } }
    })
    const noop = (req, res, next) => next()
    configure({
        config: { passport: {
            config: { origin: frontendOrigin || 'http://localhost:5173', trustProxy: [] },
            noStore: noop, httpsOnly: noop, ready: noop, sessionMiddleware: noop, lifecycle: noop,
            passport: { initialize: () => noop, session: () => noop }
        } },
        use(handler) { handlers.push(handler) }
    })
    const headers = new Map()
    const response = {
        setHeader(name, value) { headers.set(name.toLowerCase(), value) },
        getHeader(name) { return headers.get(name.toLowerCase()) },
        end() { this.ended = true }
    }
    const request = { method, headers: { 'access-control-request-method': 'GET' } }
    if (origin) request.headers.origin = origin
    let next = false
    handlers[2](request, response, () => { next = true })
    return { headers, response, next }
}

test('CORS permits the local frontend preflight with credentials for sessions', () => {
    const result = corsRequest('http://localhost:5173')
    assert.equal(result.response.statusCode, 204)
    assert.equal(result.response.ended, true)
    assert.equal(result.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    assert.equal(result.headers.get('access-control-allow-credentials'), 'true')
})

test('CORS does not authorize an unrelated origin', () => {
    const result = corsRequest('http://unrelated.example')
    assert.equal(result.headers.get('access-control-allow-origin'), undefined)
    assert.equal(result.next, true)
})

test('requests without Origin continue through the middleware', () => {
    assert.equal(corsRequest(undefined, 'GET').next, true)
})

test('CORS supports an explicitly configured frontend origin', () => {
    const origin = 'https://frontend.example'
    assert.equal(corsRequest(origin, 'OPTIONS', origin).headers.get('access-control-allow-origin'), origin)
    assert.equal(corsRequest('http://localhost:5173', 'OPTIONS', origin).headers.get('access-control-allow-origin'), undefined)
})

function apiClient(baseURL) {
    const code = source('frontend/src/plugins/axios.js')
        .replace(/^import .*$/gm, '')
        .replace('import.meta.env.VITE_API_URL', 'configuredBaseURL')
        .replace('export const ', 'const ')
        .replace('export default ', 'module.exports = ')
    return evaluate('frontend/src/plugins/axios.js', code, { axios, configuredBaseURL: baseURL,
        installAuthClient: () => ({ clearCsrf() {}, onUnauthorized() {} }) })
}

test('API client rejects missing configuration', () => {
    for (const value of [undefined, '', '   ']) {
        assert.throws(() => apiClient(value), /Configure VITE_API_URL/)
    }
})

test('API client resolves paths independently of the current browser route', async () => {
    const client = apiClient(' http://localhost:8001 ')
    const urls = []
    client.defaults.adapter = async config => {
        urls.push(client.getUri(config))
        return { data: [], status: 200, statusText: 'OK', headers: {}, config }
    }
    await client.get('/colab')
    await client.get('/registros')
    assert.deepEqual(urls, ['http://localhost:8001/colab', 'http://localhost:8001/registros'])
    assert.notEqual(client, axios)
})

test('professional registration sends its payload to /colab using the shared client', async () => {
    const file = 'frontend/src/components/pages/Inserir.vue'
    const { descriptor } = parse(source(file), { filename: file })
    assert.match(descriptor.script.content, /from ['"]@\/plugins\/axios\.js['"]/)
    const code = descriptor.script.content
        .replace(/^import .*$/gm, '')
        .replace('export default ', 'module.exports = ')
    const calls = []
    const component = evaluate(file, code, {
        axios: { post(url, data) { calls.push({ url, data }); return Promise.resolve() } },
        toast: {}, ManagementPage: {}
    })
    const payload = { colab: 'synthetic', matricula: 'TEST' }
    let reset = false
    let notified = false
    component.methods.save.call({
        postData: payload,
        selectedDepartment: { id: 1 }, loading: false, saving: false, loadError: '',
        reset() { reset = true },
        notify() { notified = true }
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(calls, [{ url: '/colab', data: payload }])
    assert.equal(reset, true)
    assert.equal(notified, true)
})
