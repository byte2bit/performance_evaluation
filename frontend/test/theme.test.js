import assert from 'node:assert/strict'
import test from 'node:test'
import { createThemeController } from '../src/js/theme.js'

function harness(saved = null, systemDark = false, blocked = false) {
    const classes = new Set(), listeners = new Set(), writes = [], changes = []
    const root = { classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name) } } }
    const media = { matches: systemDark,
        addEventListener(type, handler) { assert.equal(type, 'change'); listeners.add(handler) },
        removeEventListener(type, handler) { assert.equal(type, 'change'); listeners.delete(handler) },
    }
    const storage = {
        getItem(key) { assert.equal(key, 'evaluation-theme'); if (blocked) throw new Error('Storage blocked'); return saved },
        setItem(key, value) { if (blocked) throw new Error('Storage blocked'); writes.push({ key, value }) },
    }
    const controller = createThemeController({ root, media, storage, onChange: value => changes.push(value) })
    return { controller, writes, changes, listeners, dark: () => classes.has('dark'),
        system(value) { for (const listener of listeners) listener({ matches: value }) } }
}

test('theme follows the system until an explicit choice and removes its listener on disposal', () => {
    const theme = harness()
    assert.equal(theme.dark(), false)
    theme.system(true)
    assert.equal(theme.dark(), true)
    assert.deepEqual(theme.writes, [])
    theme.controller.toggle()
    assert.equal(theme.dark(), false)
    assert.deepEqual(theme.writes, [{ key: 'evaluation-theme', value: 'light' }])
    theme.system(true)
    assert.equal(theme.dark(), false)
    theme.controller.toggle()
    assert.equal(theme.dark(), true)
    assert.equal(theme.writes.at(-1).value, 'dark')
    theme.controller.dispose()
    assert.equal(theme.listeners.size, 0)
})

test('saved light/dark overrides the system; invalid saved values use the system without writes', () => {
    for (const [saved, system, expected] of [['light', true, false], ['dark', false, true], ['invalid', true, true]]) {
        const theme = harness(saved, system)
        assert.equal(theme.dark(), expected)
        assert.deepEqual(theme.changes, [expected])
        assert.deepEqual(theme.writes, [])
        theme.controller.dispose()
    }
})

test('storage failures preserve system initialization and allow manual changes for the current page', () => {
    const theme = harness(null, true, true)
    assert.equal(theme.dark(), true)
    theme.controller.toggle()
    assert.equal(theme.dark(), false)
    theme.system(true)
    assert.equal(theme.dark(), false)
    assert.deepEqual(theme.changes, [true, false])
    theme.controller.dispose()
})
