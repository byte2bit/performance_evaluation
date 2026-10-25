import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
export const Vue = require('vue')
const Pinia = require('pinia')
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
const { transformSync } = require('esbuild')
const Modal = require('flowbite/lib/cjs/components/modal/index.js').default
const modalInstances = require('flowbite/lib/cjs/dom/instances.js').default
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export async function flush() {
    await Promise.resolve()
    await Vue.nextTick()
    await Promise.resolve()
    await Vue.nextTick()
}

export function walk(root) {
    return [root, ...root.children.flatMap(walk)]
}

// Minimal in-memory DOM for Vue's native form directives, Teleport and the
// installed Flowbite Modal. No browser, database or external service is used.
function memoryDocument() {
    const document = { activeElement: null }
    function remove(node) {
        if (!node.parent) return
        const children = node.parent.children
        children.splice(children.indexOf(node), 1)
        node.parent = null
    }
    function insert(node, parent, anchor) {
        remove(node)
        const index = anchor ? parent.children.indexOf(anchor) : -1
        parent.children.splice(index < 0 ? parent.children.length : index, 0, node)
        node.parent = parent
    }
    function create(tag, text = '') {
        const classes = new Set()
        const node = Vue.markRaw({
            tag, text, props: {}, children: [], parent: null, value: '', checked: false,
            ownerDocument: document, listeners: new Map(),
            classList: {
                add(...names) { names.forEach(name => classes.add(name)) },
                remove(...names) { names.forEach(name => classes.delete(name)) },
                contains(name) { return classes.has(name) }
            },
            setAttribute(name, value) {
                this.props[name] = String(value)
                if (name === 'class') { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(value => classes.add(value)) }
                if (name === 'id') this.id = String(value)
            },
            getAttribute(name) { return this.props[name] ?? null },
            removeAttribute(name) { delete this.props[name] },
            addEventListener(name, handler) {
                if (!this.listeners.has(name)) this.listeners.set(name, new Set())
                this.listeners.get(name).add(handler)
            },
            removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler) },
            dispatch(name, properties = {}) {
                const event = { target: this, preventDefault() { this.defaultPrevented = true }, ...properties }
                for (const handler of [...(this.listeners.get(name) || [])]) handler(event)
                const handler = this.props[`on${name[0].toUpperCase()}${name.slice(1)}`]
                for (const callback of Array.isArray(handler) ? handler : handler ? [handler] : []) callback(event)
                return event
            },
            append(child) { insert(child, this) },
            remove() { remove(this) },
            contains(child) { return walk(this).includes(child) },
            focus() { document.activeElement = this },
            get isConnected() { return this === document.body || Boolean(this.parent?.isConnected) },
            getClientRects() {
                let current = this
                while (current) { if (current.classList.contains('hidden')) return []; current = current.parent }
                return this.isConnected ? [{}] : []
            },
            querySelectorAll(selector) {
                return walk(this).slice(1).filter(candidate => selector.split(',').some(part => {
                    const value = part.trim()
                    const tag = value.match(/^[a-z]+/i)?.[0]
                    if (tag && candidate.tag !== tag) return false
                    if (value.includes('[disabled]') && candidate.props.disabled) return false
                    if (value === '[href]') return candidate.props.href !== undefined
                    if (value.startsWith('[tabindex]')) return candidate.props.tabindex !== undefined && candidate.props.tabindex !== '-1'
                    return Boolean(tag)
                }))
            }
        })
        return node
    }
    document.body = create('body')
    document.createElement = create
    document.querySelector = selector => selector === 'body' ? document.body : null
    const renderer = Vue.createRenderer({
        createElement: create,
        createText: text => create('#text', text),
        createComment: text => create('#comment', text),
        insert, remove,
        setText: (node, text) => { node.text = text },
        setElementText: (node, text) => { node.text = text; node.children = [] },
        parentNode: node => node.parent,
        nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] || null,
        querySelector: document.querySelector,
        patchProp(node, key, previous, value) {
            node.props[key] = value
            if (['id', 'type', 'checked', 'indeterminate', 'value', 'disabled'].includes(key)) node[key] = value
            if (key === 'value') node._value = value
            if (key === 'class') node.setAttribute(key, value || '')
        },
        insertStaticContent(content, parent, anchor) {
            const node = create('#static', content)
            insert(node, parent, anchor)
            return [node, node]
        }
    })
    return { document, renderer, create }
}

export async function mountForm(t) {
    const { document, renderer, create } = memoryDocument()
    const previousDocument = globalThis.document
    globalThis.document = document
    const requests = []
    const api = {
        async get(url) {
            assert.equal(url, '/colab')
            requests.push({ method: 'GET', url })
            return { data: [{ id: 1, colab: 'Profissional A' }, { id: 2, colab: 'Profissional B' }] }
        },
        post() { assert.fail('POST is forbidden in form tests') },
        delete() { assert.fail('DELETE is forbidden in form tests') }
    }
    const cache = new Map()
    function evaluate(code, file) {
        const module = { exports: {} }
        const compiled = transformSync(code, { format: 'cjs', target: 'es2015' }).code
        vm.runInNewContext(compiled, {
            module, exports: module.exports,
            require(name) {
                if (name === 'vue') return Vue
                if (name === 'pinia') return Pinia
                if (name === 'flowbite') return { Modal }
                if (name.endsWith('.css')) return {}
                if (name === 'vue3-toastify') return { toast: { success() {}, warning() {}, error() {} } }
                if (name === 'vue-loading-overlay') return { __esModule: true, default: { render: () => Vue.h('div') } }
                if (name === 'vue-star-rating') return {
                    __esModule: true,
                    default: { name: 'StarRating', props: ['rating'], emits: ['update:rating'], render() { return Vue.h('button', { type: 'button' }, String(this.rating)) } }
                }
                const dependency = name.startsWith('@/') ? path.resolve(frontend, 'src', name.slice(2)) : path.resolve(path.dirname(file), name)
                assert.ok(dependency.startsWith(frontend + path.sep), 'Unexpected external dependency')
                return load(dependency)
            }
        }, { filename: file, timeout: 1000 })
        return module.exports
    }
    function load(file) {
        if (file === path.join(frontend, 'src/plugins/axios.js')) return { __esModule: true, default: api }
        if (!path.extname(file)) file += '.js'
        if (cache.has(file)) return cache.get(file)
        const code = fs.readFileSync(file, 'utf8')
        let result
        if (file.endsWith('.vue')) {
            const { descriptor } = parse(code, { filename: file })
            const script = compileScript(descriptor, { id: file })
            const template = compileTemplate({
                id: file, filename: file, source: descriptor.template.content,
                compilerOptions: { bindingMetadata: script.bindings, hoistStatic: false }
            })
            assert.deepEqual(template.errors, [])
            result = evaluate(script.content, file)
            result.default.render = evaluate(template.code, file).render
        } else result = evaluate(code, file)
        cache.set(file, result)
        return result
    }
    const Home = load(path.join(frontend, 'src/components/pages/Home.vue')).default
    const pinia = Pinia.createPinia()
    Pinia.setActivePinia(pinia)
    const visible = Vue.ref(true)
    const root = create('root')
    document.body.append(root)
    const app = renderer.createApp({ render: () => visible.value ? Vue.h(Home) : Vue.h('div') })
    app.use(pinia)
    app.directive('sanitize', {})
    app.mount(root)
    t.after(() => {
        app.unmount()
        globalThis.document = previousDocument
        assert.equal(Object.keys(modalInstances.getInstances('Modal')).length, 0)
        assert.equal(document.body.classList.contains('overflow-hidden'), false)
        assert.equal(document.body.listeners.get('keydown')?.size || 0, 0)
    })
    await flush()

    function components(vnode) {
        if (!vnode || typeof vnode !== 'object') return []
        const instance = vnode.component
        return [
            ...(instance ? [instance, ...components(instance.subTree)] : []),
            ...(Array.isArray(vnode.children) ? vnode.children.flatMap(components) : [])
        ]
    }
    const allComponents = () => components(app._instance.subTree)
    return {
        document, root, visible, requests,
        store: load(path.join(frontend, 'src/stores/colabStore.js')).useColabStore(pinia),
        component: name => allComponents().find(instance => (instance.type.__name || instance.type.name) === name),
        stars: () => allComponents().filter(instance => instance.type.name === 'StarRating'),
        element: id => walk(document.body).find(node => node.id === id),
        modal: id => modalInstances.getInstance('Modal', id),
        instanceCount: () => Object.keys(modalInstances.getInstances('Modal')).length,
        backdrops: () => walk(document.body).filter(node => node.classList.contains('bg-gray-900/50'))
    }
}
