import assert from 'node:assert/strict'
import test from 'node:test'
import { mountForm, flush, walk } from './helpers/form-harness.js'

test('selection, select all and store replacement stay synchronized with the list and summary', async t => {
    const form = await mountForm(t)
    assert.equal(form.requests.length, 1)
    const first = form.element('checkbox-1')
    first.checked = true
    first.dispatch('change')
    await flush()
    assert.deepEqual(Array.from(form.store.chkColabs), [1])
    assert.equal(form.element('select-all-colabs').indeterminate, true)
    form.element('select-all-colabs').dispatch('change')
    await flush()
    assert.deepEqual(Array.from(form.store.chkColabs), [1, 2])
    assert.equal(form.element('checkbox-2').checked, true)
    assert.equal(form.element('select-all-colabs').checked, true)
    form.store.chkColabs = [2]
    await flush()
    assert.equal(form.element('checkbox-1').checked, false)
    assert.equal(form.element('checkbox-2').checked, true)
    assert.deepEqual(Array.from(form.component('Form').setupState.chkColabs), [2])
    form.store.clearSelection()
    await flush()
    assert.equal(form.element('checkbox-2').checked, false)
    assert.equal(form.element('select-all-colabs').indeterminate, false)
})

test('namesakes remain individually selectable by ID and keep both identities in the review', async t => {
    const form = await mountForm(t)
    form.store.colabs = [
        { id: 10, colab: 'Homônimo fictício', matricula: 'FICT-10' },
        { id: 11, colab: 'Homônimo fictício', matricula: 'FICT-11' }
    ]
    await flush()
    const first = form.element('checkbox-10')
    first.checked = true; first.dispatch('change')
    await flush()
    assert.equal(first.checked, true)
    assert.equal(form.element('checkbox-11').checked, false)
    assert.deepEqual(Array.from(form.store.chkColabs), [10])
    assert.match(form.store.selectionDetails(form.store.selectedColabs[0]), /Cadastro: 10/)
    form.element('select-all-colabs').dispatch('change')
    await flush()
    assert.deepEqual(Array.from(form.store.chkColabs), [10, 11])
    assert.deepEqual(Array.from(form.component('Form').setupState.selectedColabs, row => row.id), [10, 11])
    const text = walk(form.root).map(node => node.text).join(' ')
    assert.match(text, /FICT-10/)
    assert.match(text, /FICT-11/)
    // Registration numbers are not unique in the legacy schema either.
    form.store.colabs[1].matricula = 'FICT-10'
    await flush()
    assert.notEqual(form.store.selectionDetails(form.store.colabs[0]), form.store.selectionDetails(form.store.colabs[1]))
    form.element('checkbox-11').dispatch('change')
    await flush()
    assert.deepEqual(Array.from(form.store.chkColabs), [10])
})

test('a refreshed professional list removes transferred selections instead of leaving stale identities selected', async t => {
    const form = await mountForm(t)
    form.store.colabs = [{ id: 99, colab: 'Profissional transferido' }]
    form.store.toggleColab(99)
    assert.equal(form.component('Form').setupState.validatePostData().length, 0)
    // The harness API returns only its original IDs 1/2 on refresh.
    await form.store.loadColabs()
    await flush()
    assert.deepEqual(Array.from(form.store.chkColabs), [])
    assert.equal(form.store.selectedColabs.length, 0)
    assert.equal(form.component('Form').setupState.validatePostData().length, 1)
})

for (const [name, starIndex, modalId, itemId, itemKey] of [
    ['quality', 0, 'qualidade-modal', 'check-qualidade-1', 'itensQualidade'],
    ['availability', 2, 'dispon-modal', 'check-dispon-1', 'itensDispon']
]) {
    test(`${name} low rating opens its own modal and item updates reach the form`, async t => {
        const form = await mountForm(t)
        const star = form.stars()[starIndex]
        star.emit('update:rating', 3)
        await flush()
        assert.equal(form.modal(modalId).isVisible(), true)
        const checkbox = form.element(itemId)
        checkbox.checked = true
        checkbox.dispatch('change')
        await flush()
        assert.equal(form.component('Form').setupState.postData[itemKey].length, 1)
        star.emit('update:rating', 4)
        await flush()
        assert.equal(form.modal(modalId).isVisible(), false)
        assert.equal(form.component('Form').setupState.postData[itemKey].length, 0)
        assert.equal(checkbox.checked, false)
    })
}

test('modal OK, Escape and outside click synchronize visibility and restore focus', async t => {
    const form = await mountForm(t)
    const star = form.stars()[0]
    const trigger = star.subTree.el
    trigger.focus()
    star.emit('update:rating', 2)
    await flush()
    const modal = form.element('qualidade-modal')
    const button = modal.querySelectorAll('button')[0]
    button.dispatch('click')
    await flush()
    assert.equal(form.component('Qualidade').setupState.showSubModal, false)
    assert.equal(form.document.activeElement, trigger)
    trigger.dispatch('click')
    await flush()
    assert.equal(form.modal('qualidade-modal').isVisible(), true)
    form.document.body.dispatch('keydown', { key: 'Escape' })
    await flush()
    assert.equal(form.modal('qualidade-modal').isVisible(), false)
    trigger.dispatch('click')
    await flush()
    modal.dispatch('click')
    await flush()
    assert.equal(form.component('Qualidade').setupState.showSubModal, false)
    assert.equal(form.backdrops().length, 0)
})

test('focus stays inside the modal when tabbing in either direction', async t => {
    const form = await mountForm(t)
    form.stars()[0].emit('update:rating', 3)
    await flush()
    const modal = form.element('qualidade-modal')
    const first = form.element('check-qualidade-1')
    const last = modal.querySelectorAll('button')[0]
    first.focus()
    assert.equal(modal.dispatch('keydown', { key: 'Tab', shiftKey: true }).defaultPrevented, true)
    assert.equal(form.document.activeElement, last)
    assert.equal(modal.dispatch('keydown', { key: 'Tab', shiftKey: false }).defaultPrevented, true)
    assert.equal(form.document.activeElement, first)
})

test('switching modals keeps only one backdrop and reset clears the shared selection and criteria', async t => {
    const form = await mountForm(t)
    form.store.selectAllColabs()
    form.stars()[0].emit('update:rating', 2)
    await flush()
    form.stars()[2].emit('update:rating', 2)
    await flush()
    assert.equal(form.modal('qualidade-modal').isVisible(), false)
    assert.equal(form.modal('dispon-modal').isVisible(), true)
    assert.equal(form.backdrops().length, 1)
    assert.equal(form.document.body.classList.contains('overflow-hidden'), true)
    const state = form.component('Form').setupState
    state.showReview = true
    await flush()
    assert.equal(form.modal('dispon-modal').isVisible(), false)
    assert.equal(form.modal('default-modal').isVisible(), true)
    state.reset()
    await flush()
    assert.equal(form.store.chkColabs.length, 0)
    assert.equal(state.postData.nota_qualidade, 5)
    assert.equal(state.postData.nota_dispon, 5)
    assert.equal(state.postData.itensQualidade.length, 0)
    assert.equal(state.postData.itensDispon.length, 0)
    assert.equal(form.element('checkbox-1').checked, false)
    assert.equal(form.modal('default-modal').isVisible(), false)
    assert.equal(form.backdrops().length, 0)
})

test('leaving and reopening Home cleans modal instances and preserves the store selection', async t => {
    const form = await mountForm(t)
    form.store.toggleColab(1)
    form.stars()[0].emit('update:rating', 2)
    await flush()
    const ids = walk(form.document.body).map(node => node.id).filter(Boolean)
    assert.equal(new Set(ids).size, ids.length)
    form.visible.value = false
    await flush()
    assert.equal(form.instanceCount(), 0)
    assert.equal(form.backdrops().length, 0)
    assert.equal(form.document.body.listeners.get('keydown')?.size || 0, 0)
    assert.equal(form.document.body.classList.contains('overflow-hidden'), false)
    form.visible.value = true
    await flush()
    assert.equal(form.instanceCount(), 3)
    assert.equal(form.element('checkbox-1').checked, true)
    assert.equal(form.requests.length, 2)
})

test('review buttons and form submission do not send evaluations or email', async t => {
    const form = await mountForm(t)
    const reviewButton = walk(form.root).find(node => node.props['aria-controls'] === 'default-modal')
    reviewButton.dispatch('click')
    await flush()
    assert.equal(form.modal('default-modal').isVisible(), true)
    form.element('default-modal').querySelectorAll('button')[0].dispatch('click')
    await flush()
    assert.equal(form.modal('default-modal').isVisible(), false)
    walk(form.root).find(node => node.tag === 'form').dispatch('submit')
    await flush()
    assert.equal(form.requests.every(request => request.method === 'GET'), true)
})

test('validation observes the current selected collaborators and required criterion items', async t => {
    const form = await mountForm(t)
    const state = form.component('Form').setupState
    assert.equal(state.validatePostData().length, 1)
    form.store.selectAllColabs()
    assert.equal(state.validatePostData().length, 0)
    form.stars()[0].emit('update:rating', 2)
    await flush()
    assert.equal(state.validatePostData().length, 1)
    const checkbox = form.element('check-qualidade-1')
    checkbox.checked = true
    checkbox.dispatch('change')
    await flush()
    assert.equal(state.validatePostData().length, 0)
})
