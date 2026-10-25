import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const Vue = require('vue')
const VueRouter = require('vue-router')
const { parse, compileScript } = require('@vue/compiler-sfc')
const { transformSync } = require('esbuild')
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Render the actual shell, links, Home and router in memory. Page contents
// are replaced so navigation cannot load personal data or call any service.
function loadApplication() {
    const cache = new Map()
    const pages = new Map([
        ['src/components/pages/Form.vue', 'Form'],
        ['src/components/ListCheckboxes.vue', 'ListCheckboxes'],
        ...['Inserir', 'Registros', 'Colabs', 'Excel'].map(name => [`src/components/pages/${name}.vue`, name]),
        ['src/components/utils/CheckAll.vue', 'CheckAll']
    ].map(([file, name]) => [path.resolve(frontend, file), {
        name,
        render: () => Vue.h('section', { 'data-test-view': name }, name)
    }]))

    function load(file) {
        if (pages.has(file)) return { __esModule: true, default: pages.get(file) }
        if (cache.has(file)) return cache.get(file).exports
        if (/\.(png|svg)$/.test(file)) return file
        let code = fs.readFileSync(file, 'utf8')
        if (file.endsWith('.vue')) {
            const { descriptor } = parse(code, { filename: file })
            code = compileScript(descriptor, {
                id: file,
                inlineTemplate: true,
                templateOptions: { compilerOptions: { hoistStatic: false } }
            }).content
        }
        code = transformSync(code, {
            format: 'cjs', target: 'es2015', supported: { 'dynamic-import': false }
        }).code
        const module = { exports: {} }
        cache.set(file, module)
        vm.runInNewContext(code, {
            module,
            exports: module.exports,
            require(name) {
                if (name === 'vue') return Vue
                if (name === 'vue-router') return { ...VueRouter, createWebHistory: VueRouter.createMemoryHistory }
                const dependency = name.startsWith('@/')
                    ? path.resolve(frontend, 'src', name.slice(2))
                    : path.resolve(path.dirname(file), name)
                assert.ok(dependency.startsWith(frontend + path.sep), 'Unexpected external module')
                return load(dependency)
            }
        }, { filename: file, timeout: 1000 })
        return module.exports
    }
    return {
        App: load(path.join(frontend, 'src/App.vue')).default,
        router: load(path.join(frontend, 'src/router/index.js')).default
    }
}

function memoryRenderer() {
    const node = (tag, text = '') => ({ tag, text, props: {}, children: [], parent: null })
    function remove(child) {
        if (child.parent) {
            const siblings = child.parent.children
            const index = siblings.indexOf(child)
            if (index >= 0) siblings.splice(index, 1)
            child.parent = null
        }
    }
    function insert(child, parent, anchor) {
        remove(child)
        const index = anchor ? parent.children.indexOf(anchor) : -1
        parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
        child.parent = parent
    }
    const renderer = Vue.createRenderer({
        createElement: tag => node(tag),
        createText: text => node('#text', text),
        createComment: text => node('#comment', text),
        setText: (target, text) => { target.text = text },
        setElementText: (target, text) => { target.text = text; target.children = [] },
        patchProp: (target, key, previous, value) => { target.props[key] = value },
        parentNode: target => target.parent,
        nextSibling: target => target.parent?.children[target.parent.children.indexOf(target) + 1] || null,
        insert,
        remove,
        insertStaticContent(content, parent, anchor) {
            const target = node('#static', content)
            insert(target, parent, anchor)
            return [target, target]
        }
    })
    return { renderer, root: node('root') }
}

function find(root, predicate) {
    return [...(predicate(root) ? [root] : []), ...root.children.flatMap(child => find(child, predicate))]
}

async function mount(t, location) {
    const { App, router } = loadApplication()
    const { renderer, root } = memoryRenderer()
    await router.push(location)
    await router.isReady()
    const app = renderer.createApp(App)
    app.use(router)
    app.mount(root)
    t.after(() => app.unmount())
    await Vue.nextTick()
    return { root, router }
}

function assertPage(root, name) {
    assert.equal(find(root, target => target.props['data-test-view'] === name).length, 1)
    assert.equal(find(root, target => target.props['data-test-view'] === 'ListCheckboxes').length, name === 'Form' ? 1 : 0)
    assert.ok(find(root, target => target.tag === 'header').length > 0)
    assert.equal(find(root, target => target.tag === 'footer').length, 1)
}

for (const [location, name] of [
    ['/', 'Form'], ['/inserir', 'Inserir'], ['/registros', 'Registros'],
    ['/colabs', 'Colabs'], ['/excel', 'Excel'], ['/checkall', 'CheckAll']
]) {
    test(`direct entry ${location} renders its page and preserves its route name`, async t => {
        const { root, router } = await mount(t, location)
        assert.equal(router.currentRoute.value.name, name)
        assertPage(root, name)
    })
}

test('menu clicks replace the page without nested anchors or hash navigation', async t => {
    const { root, router } = await mount(t, '/')
    for (const [location, name] of [['/registros', 'Registros'], ['/colabs', 'Colabs'], ['/inserir', 'Inserir'], ['/', 'Form']]) {
        const link = find(root, target => target.tag === 'a' && target.props.href === location)[0]
        assert.ok(link, `Missing menu link: ${location}`)
        assert.equal(link.children.flatMap(child => find(child, target => target.tag === 'a')).length, 0)
        await link.props.onClick({ button: 0, preventDefault() {} })
        await Vue.nextTick()
        assert.equal(router.currentRoute.value.fullPath, location)
        assert.equal(link.props['aria-current'], 'page')
        assertPage(root, name)
    }
})

test('history back restores the initial form and collaborator list', async t => {
    const { root, router } = await mount(t, '/')
    await router.push('/registros')
    await Vue.nextTick()
    assertPage(root, 'Registros')
    await new Promise(resolve => {
        const stop = router.afterEach(() => { stop(); resolve() })
        router.back()
    })
    await Vue.nextTick()
    assert.equal(router.currentRoute.value.fullPath, '/')
    assertPage(root, 'Form')
})
