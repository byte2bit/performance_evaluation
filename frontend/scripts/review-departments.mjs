// Browser regression with fully mocked APIs. Never contacts SQL or SMTP.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
assert.ok(process.env.EVAL_VISUAL_TOOL_DIRECTORY)
const require = createRequire(path.resolve(process.env.EVAL_VISUAL_TOOL_DIRECTORY, 'package.json'))
const { chromium } = require('playwright-core')
const output = path.resolve('frontend/node_modules/.cache/departments-review')
await fs.mkdir(output, { recursive: true })
const checks = [], errors = [], origin = 'http://localhost:5173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of [320, 390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
    let admin = true, failSave = false, failLoad = false, empty = false, legacy = false
    const calls = []
    const users = [{ id: 1, name: 'Administrador fictício', email: 'admin@example.invalid', active: true, admin: true },
      { id: 2, name: 'Demandante fictício', email: 'reviewer@example.invalid', active: true, admin: false }]
    const departments = [{ id: 1, nome: 'Gerência técnica', demandante_id: 2, demandante_nome: users[1].name,
      demandante: users[1].email, demandante_disponivel: true, deletedAt: null }]
    const professional = { id: 1, colab: 'Profissional fictício', gerencia_id: 1, gerencia: departments[0].nome,
      demandante: users[1].email, matricula: 'F001', deletedAt: null }
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 }, colorScheme })
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== 'http://localhost:8001') return route.abort()
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS' }
      const reply = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) })
      if (req.method() === 'OPTIONS') return reply({})
      if (url.pathname === '/session') return reply({ ...users[admin ? 0 : 1], admin })
      if (url.pathname === '/csrf-token') return reply({ csrfToken: 'a'.repeat(64) })
      if (['POST', 'PUT', 'DELETE'].includes(req.method())) {
        calls.push({ method: req.method(), pathname: url.pathname, body: req.postDataJSON() })
        return reply({}, failSave ? 409 : 200)
      }
      if (failLoad && ['/gerencias', '/demandantes'].includes(url.pathname)) return reply({}, 503)
      if (url.pathname === '/demandantes') return reply(empty ? [] : users)
      if (url.pathname === '/gerencias') return reply(empty ? [] : departments)
      if (url.pathname === '/colab/1') return reply(professional)
      if (url.pathname === '/colab') return reply([legacy ? { id: 1, colab: professional.colab } : professional])
      throw new Error('Unexpected mocked management endpoint')
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    for (const [location, title] of [['demandantes', 'Demandantes'], ['gerencias', 'Gerências'], ['inserir', 'Inserir profissional'], ['editar-profissional/1', 'Editar profissional']]) {
      await page.goto(origin + '/' + location)
      await page.getByRole('heading', { level: 1, name: title, exact: true }).waitFor()
      if (location === 'demandantes') await page.getByRole('cell', { name: users[1].email, exact: true }).waitFor()
      if (location === 'gerencias') await page.getByRole('cell', { name: /^Gerência técnica/ }).waitFor()
      if (location.includes('profissional') || location === 'inserir') await page.locator('#gerencia option[value="1"]').waitFor({ state: 'attached' })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}/${colorScheme}/${location}: overflow`)
      await page.screenshot({ path: path.join(output, `${width}-${colorScheme}-${location.replaceAll('/', '-')}.png`), fullPage: true })
      checks.push(`${width}/${colorScheme}/${location}: render, labels, responsive layout`)
    }
    if (width === 1440 && colorScheme === 'light') {
      await page.goto(origin + '/inserir')
      await page.getByLabel('Gerência', { exact: true }).selectOption('1')
      assert.equal(await page.getByLabel('Demandante', { exact: true }).getAttribute('readonly'), '')
      assert.ok((await page.getByLabel('Demandante', { exact: true }).inputValue()).includes(users[1].email))
      await page.getByLabel('Nome do profissional', { exact: true }).fill('Novo fictício')
      await page.getByRole('button', { name: 'Enviar', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('#profissional').value === '')
      assert.equal(calls.at(-1).body.gerencia_id, 1); assert.equal(Object.hasOwn(calls.at(-1).body, 'demandante'), false)
      checks.push('professional: selected department and derived responsible, create payload')
      await page.goto(origin + '/editar-profissional/1')
      await page.waitForFunction(() => document.querySelector('#profissional')?.value === 'Profissional fictício')
      await page.getByLabel('Nome do profissional', { exact: true }).fill('Nome corrigido')
      await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click()
      await page.waitForURL(origin + '/colabs')
      assert.equal(calls.at(-1).method, 'PUT'); assert.equal(calls.at(-1).pathname, '/colab/1')
      checks.push('professional: edit saves by stable ID')
      await page.goto(origin + '/demandantes')
      await page.getByLabel('Nome', { exact: true }).fill('Novo demandante')
      await page.getByLabel('E-mail', { exact: true }).fill('new@example.invalid')
      await page.getByLabel('Senha inicial', { exact: true }).fill('synthetic-password-for-tests')
      await page.getByLabel('Confirmar senha', { exact: true }).fill('synthetic-password-for-tests')
      failSave = true
      await page.getByRole('button', { name: 'Cadastrar demandante', exact: true }).click()
      await page.getByRole('alert').waitFor()
      assert.equal(await page.getByLabel('Senha inicial', { exact: true }).inputValue(), '')
      assert.equal(await page.getByLabel('Nome', { exact: true }).inputValue(), 'Novo demandante')
      failSave = false
      await page.getByLabel('Senha inicial', { exact: true }).fill('synthetic-password-for-tests')
      await page.getByLabel('Confirmar senha', { exact: true }).fill('synthetic-password-for-tests')
      await page.getByRole('button', { name: 'Cadastrar demandante', exact: true }).click()
      await page.getByText(/Demandante salvo/).waitFor()
      assert.equal(Object.hasOwn(calls.at(-1).body, 'admin'), false)
      await page.getByRole('button', { name: 'Editar demandante Demandante fictício', exact: true }).click()
      assert.equal(await page.locator('#demandante-senha').count(), 0)
      await page.getByLabel('Nome', { exact: true }).fill('Demandante atualizado')
      await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click()
      await page.getByText(/Demandante salvo/).waitFor()
      assert.equal(calls.at(-1).method, 'PUT'); assert.equal(Object.hasOwn(calls.at(-1).body, 'password'), false)
      checks.push('accounts: create, duplicate feedback, secret cleanup, edit without credential exposure')
      await page.getByRole('button', { name: 'Excluir demandante Demandante fictício', exact: true }).click()
      await page.getByRole('dialog').waitFor()
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
      checks.push('accounts: confirmation cancellation preserves the account')
      await page.goto(origin + '/gerencias')
      await page.getByRole('button', { name: 'Editar gerência Gerência técnica', exact: true }).click()
      await page.getByLabel('Demandante responsável', { exact: true }).selectOption('1')
      await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click()
      await page.getByText(/Gerência salva/).waitFor()
      assert.equal(calls.at(-1).body.demandante_id, 1)
      checks.push('departments: ownership transfer form saves selected account ID')
      empty = true
      await page.goto(origin + '/inserir')
      await page.getByText(/Cadastre uma gerência com demandante ativo/).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Enviar', exact: true }).isDisabled(), true)
      empty = false; failLoad = true
      await page.goto(origin + '/inserir')
      await page.getByText(/Não foi possível carregar as gerências/).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Enviar', exact: true }).isDisabled(), true)
      failLoad = false; await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
      await page.locator('#gerencia option[value="1"]').waitFor({ state: 'attached' })
      checks.push('professional: empty/error/retry states block invalid submission')
      legacy = true
      await page.goto(origin + '/colabs')
      await page.locator('.mp-person').first().waitFor()
      assert.equal(await page.locator('.mp-delete, .mp-edit').count(), 0)
      checks.push('legacy API: physical deletion cannot be presented as archiving')
      legacy = false
      admin = false
      for (const location of ['demandantes', 'gerencias', 'editar-profissional/1']) {
        await page.goto(origin + '/' + location)
        await page.waitForURL(origin + '/')
        assert.equal(await page.locator('a[href="/demandantes"], a[href="/gerencias"]').count(), 0)
      }
      checks.push('evaluator: administrative routes and navigation denied')
    }
    await context.close()
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ passed: checks.length, checks, errors }, null, 2))
  console.log(JSON.stringify({ passed: checks.length, errors: errors.length, output }))
} finally { await browser.close() }
