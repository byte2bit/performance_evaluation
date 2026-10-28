import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse } from '@vue/compiler-sfc'

function page(name, api) {
  const source = fs.readFileSync(new URL(`../src/components/pages/${name}.vue`, import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const module = { exports: {} }, notifications = []
  vm.runInNewContext(descriptor.script.content.replace(/^import .*$/gm, '').replace('export default ', 'module.exports = '), {
    module, axios: api, ManagementPage: {}, ConfirmDeleteModal: {}, toast: {
      success: text => notifications.push(text), error: text => notifications.push(text),
    },
  })
  const options = module.exports, instance = { ...options.data(), $refs: {}, $router: { async push() {} } }
  for (const [name, method] of Object.entries(options.methods)) instance[name] = method.bind(instance)
  for (const [name, getter] of Object.entries(options.computed || {})) Object.defineProperty(instance, name, { get: getter.bind(instance) })
  return { instance, notifications, options, template: descriptor.template.content }
}

test('account form rejects unmatched passwords, clears secrets on failure and preserves name/email for retry', async () => {
  let writes = 0
  const { instance, template } = page('Demandantes', { async post() { writes++; throw new Error('private fixture diagnostic') } })
  Object.assign(instance.form, { name: 'Fictício', email: 'fixture@example.invalid', password: 'a'.repeat(15), confirmation: 'b'.repeat(15) })
  await instance.save(); assert.equal(writes, 0)
  instance.form.confirmation = instance.form.password
  await instance.save(); assert.equal(writes, 1)
  assert.equal(instance.form.password, ''); assert.equal(instance.form.confirmation, '')
  assert.equal(instance.form.name, 'Fictício'); assert.equal(instance.form.email, 'fixture@example.invalid')
  assert.ok(!instance.error.includes('private'))
  assert.match(template, /autocomplete="new-password"/)
})

test('editing an account sends only name/email and deletes remain visible when reassignment is required', async () => {
  const calls = []
  const { instance } = page('Demandantes', {
    async put(url, data) { calls.push({ url, data: { ...data } }) },
    async get() { return { data: [{ id: 2, name: 'Atualizado', email: 'new@example.invalid' }] } },
    async delete() { throw { response: { status: 409, data: 'private fixture diagnostic' } } },
  })
  instance.edit({ id: 2, name: 'Atualizado', email: 'new@example.invalid' })
  await instance.save()
  assert.deepEqual(calls, [{ url: '/demandantes/2', data: { name: 'Atualizado', email: 'new@example.invalid' } }])
  instance.askRemove(instance.rows[0]); await instance.remove()
  assert.equal(instance.rows.length, 1); assert.match(instance.error, /Reatribua/); assert.ok(!instance.error.includes('private'))
})

test('department form selects only active accounts and saves a single owner ID', async () => {
  const calls = []
  const { instance, template } = page('Gerencias', {
    async get(url) { return { data: url.startsWith('/gerencias') ? [] : [{ id: 2, active: true, deletedAt: null }, { id: 3, active: false }, { id: 4, active: true, deletedAt: 'fixture' }] } },
    async post(url, data) { calls.push({ url, data: { ...data } }) },
  })
  await instance.load(); assert.equal(instance.available.length, 1)
  instance.form = { nome: 'Gerência fictícia', demandante_id: 3 }; await instance.save(); assert.equal(calls.length, 0)
  instance.form.demandante_id = 2; await instance.save()
  assert.deepEqual(calls, [{ url: '/gerencias', data: { nome: 'Gerência fictícia', demandante_id: 2 } }])
  assert.match(template, /A autoria das avaliações é preservada/)
})

test('professional form derives the responsible display, blocks unavailable selection and uses PUT for editing', async () => {
  const calls = []
  const { instance, template } = page('Inserir', {
    async get() { return { data: [{ id: 1, nome: 'Gerência A', demandante_nome: 'Avaliador', demandante: 'test@example.invalid', demandante_disponivel: true }, { id: 2, demandante_disponivel: false }] } },
    async put(url, data) { calls.push({ url, data: { ...data } }) },
  })
  await instance.save(); assert.equal(calls.length, 0)
  await instance.loadGerencias(); assert.equal(instance.gerencias.length, 1)
  instance.editingId = 7; instance.postData.colab = 'Fictício'; instance.postData.gerencia_id = 1
  assert.match(instance.responsible, /Avaliador.*test@example.invalid/)
  await instance.save(); assert.equal(calls[0].url, '/colab/7'); assert.equal(calls[0].data.gerencia_id, 1)
  assert.equal(Object.hasOwn(calls[0].data, 'demandante'), false)
  assert.match(template, /id="demandante"[^>]*readonly/)
})

test('failed or late administrative list responses preserve state and cannot repopulate an unmounted page', async () => {
  const { instance, options } = page('Gerencias', { async get() { throw new Error('synthetic private') } })
  instance.rows = [{ id: 1 }]; await instance.load(); assert.equal(instance.rows.length, 1); assert.ok(!instance.error.includes('private'))
  const { instance: accounts, options: accountOptions } = page('Demandantes', { async get() { return { data: [{ id: 99 }] } } })
  accountOptions.beforeUnmount.call(accounts); await accounts.load(); assert.equal(accounts.rows.length, 0)
  assert.equal(typeof options.beforeUnmount, 'function')
})

test('retrying a failed professional edit reloads the professional before enabling a save', async () => {
  let unavailable = true, writes = 0
  const { instance } = page('Inserir', {
    async get(url) {
      if (url === '/gerencias') return { data: [{ id: 1, demandante_disponivel: true }] }
      if (unavailable) throw new Error('synthetic failure')
      return { data: { colab: 'Nome preservado', gerencia_id: 1, matricula: 'F001' } }
    },
    async put() { writes++ },
  })
  instance.editingId = 1
  await instance.loadPage(); assert.ok(instance.loadError)
  await instance.save(); assert.equal(writes, 0)
  unavailable = false
  await instance.loadPage(); assert.equal(instance.loadError, '')
  assert.equal(instance.postData.colab, 'Nome preservado'); assert.equal(instance.postData.matricula, 'F001')
  await instance.save(); assert.equal(writes, 1)
})
