// Opt-in visual review. All API traffic is mocked and external destinations are blocked.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const toolDirectory = process.env.EVAL_VISUAL_TOOL_DIRECTORY
assert.ok(toolDirectory, 'Configure EVAL_VISUAL_TOOL_DIRECTORY with an existing playwright-core installation.')
const require = createRequire(path.resolve(toolDirectory, 'package.json'))
const { chromium } = require('playwright-core')
const origin = 'http://localhost:5173'
const apiOrigin = 'http://localhost:8001'
const output = path.resolve('frontend/node_modules/.cache/records-review')
await fs.mkdir(output, { recursive: true })
const checks = [], captures = [], errors = []
const name = 'Profissional homônimo fictício'
function fixture(id, colab_id, created_at, grade, extra = {}) {
  return { id, colab_id, colab: name, created_at, updated_at: created_at,
    nota_qualidade: String(grade), nota_prazo: String(grade), nota_dispon: String(grade), nota_respon: String(grade),
    avaliacao: String(grade), nivel: grade >= 4.5 ? 'A' : grade >= 4 ? 'B' : 'C', desconto: grade >= 4.5 ? '0%' : grade >= 4 ? '1%' : '2%',
    obs_qualidade: 'Observação fictícia <script>window.syntheticInjection = true</script>',
    obs_prazo: 'Comentário fictício de prazo', obs_dispon: 'Comentário fictício de disponibilidade', obs_respon: 'Comentário fictício de responsabilidade',
    itensQualidade: 'Critério fictício de qualidade', itensDispon: 'Critério fictício de disponibilidade',
    liderancas: 'Liderança fictícia', demandante: 'original@example.invalid', ...extra }
}
const records = [fixture(1, 101, '2026-09-01T00:00:00.000Z', 4), fixture(2, 101, '2026-10-01T00:00:00.000Z', 3.5),
  fixture(3, 101, '2026-10-31T23:59:59.000Z', 4.5), fixture(4, 101, '2026-12-01T00:00:00.000Z', 5),
  fixture(5, 202, '2026-10-15T12:00:00.000Z', 4), fixture(6, null, '2026-10-10T12:00:00.000Z', 4, { colab: 'Registro fictício sem vínculo' })]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const width of [1440, 768, 390, 320]) for (const colorScheme of ['light', 'dark']) {
    const scenario = `${width}-${colorScheme}`
    let admin = true, failRecords = false, allowedRecords = records, recordRequests = 0
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 1000 }, colorScheme, locale: 'pt-BR' })
    try {
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.origin === origin) return route.continue()
        if (url.origin !== apiOrigin) return route.abort()
        const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
          'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,OPTIONS' }
        const reply = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) })
        if (request.method() === 'OPTIONS') return reply({})
        assert.equal(request.method(), 'GET', 'No writes allowed in this UI review')
        if (url.pathname === '/session') return reply({ id: admin ? 1 : 2, name: 'Conta fictícia', email: 'test@example.invalid', admin })
        if (url.pathname === '/csrf-token') return reply({ csrfToken: 'a'.repeat(64) })
        if (url.pathname === '/colab') return reply([])
        if (url.pathname === '/registros') { recordRequests++; return reply(failRecords ? { error: 'synthetic private detail' } : allowedRecords, failRecords ? 503 : 200) }
        throw new Error('Unexpected mocked API route')
      })
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      page.on('pageerror', error => errors.push(error.message))
      const check = (label, condition = true) => { assert.ok(condition, `${scenario}: ${label}`); checks.push(`${scenario}: ${label}`) }
      const capture = async (label, fullPage = true) => {
        const file = `${scenario}-${label}.png`
        await page.screenshot({ path: path.join(output, file), fullPage })
        captures.push(file)
      }
      const fit = async modal => {
        const dimensions = await page.evaluate(() => {
          const panel = document.querySelector('.record-history .app-modal-panel')?.getBoundingClientRect()
          return { pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
            panel: panel ? { left: panel.left, right: panel.right } : null }
        })
        check(`${modal ? 'history' : 'page'} fits viewport`, dimensions.pageWidth <= dimensions.viewport + 1 &&
          (!modal || dimensions.panel && dimensions.panel.left >= -1 && dimensions.panel.right <= dimensions.viewport + 1))
      }
      await page.goto(origin + '/registros')
      await page.getByRole('heading', { level: 1, name: 'Registros', exact: true }).waitFor()
      await page.waitForFunction(() => document.querySelectorAll('.mp-person').length === 6)
      await fit(false); await capture('page')
      await page.getByLabel('Data inicial', { exact: true }).fill('2026-10-01')
      await page.getByLabel('Data final', { exact: true }).fill('2026-10-31')
      check('inclusive period', await page.locator('.mp-person').count() === 4)
      await page.getByLabel('Buscar registros', { exact: true }).fill('31/10/2026')
      check('period combined with formatted date search', await page.locator('.mp-person').count() === 1)
      const beforeOpen = recordRequests
      const trigger = page.getByRole('button', { name: `Consultar avaliações de ${name}, profissional 101`, exact: true }).first()
      await trigger.click()
      const modal = page.locator('#professional-history-modal')
      await modal.waitFor({ state: 'visible' })
      await modal.locator('.rh-evaluation').first().waitFor()
      check('history refreshes authorization and ignores table filters', recordRequests > beforeOpen && await modal.locator('.rh-evaluation').count() === 4)
      check('namesakes and unlinked records excluded', !(await modal.innerText()).includes('Avaliação #5') && !(await modal.innerText()).includes('Avaliação #6'))
      check('all notes, comments and stored metadata rendered', await modal.locator('.rh-notes section').count() === 16 &&
        (await modal.innerText()).includes('original@example.invalid') && (await modal.innerText()).includes('Critério fictício de disponibilidade') &&
        (await modal.innerText()).includes('31/10/2026 às 23:59:59 (UTC)'))
      check('comment content remains text', (await modal.innerText()).includes('<script>window.syntheticInjection = true</script>') &&
        await page.evaluate(() => window.syntheticInjection === undefined))
      check('legacy monthly averaging notice', (await modal.innerText()).includes('Há meses com mais de uma avaliação antiga'))
      check('missing month creates graph gaps', await modal.locator('.rh-chart-scroll polyline').count() === 10 && await modal.locator('.rh-chart-scroll circle').count() === 15)
      await fit(true); await capture('history', false)
      await modal.getByText('Consultar médias mensais em tabela', { exact: true }).click()
      const october = modal.locator('tbody tr').filter({ hasText: '10/2026' })
      check('accessible monthly averages and legacy count', (await october.locator('th,td').allTextContents()).join('|') === '10/2026|2|4|4|4|4|4')
      await modal.getByRole('button', { name: 'Qualidade', exact: true }).click()
      check('legend toggles series', await modal.locator('.rh-chart-scroll circle').count() === 12)
      await modal.getByRole('button', { name: 'Qualidade', exact: true }).click()
      if (width === 1440 && colorScheme === 'light' || width === 390 && colorScheme === 'dark') {
        await modal.locator('.rh-evaluation').last().scrollIntoViewIfNeeded()
        await capture('history-details', false)
        await modal.locator('.app-modal-body').evaluate(element => { element.scrollTop = 0 })
      }
      const close = modal.getByRole('button', { name: 'Fechar histórico', exact: true })
      await close.focus(); await page.keyboard.press('Shift+Tab')
      check('reverse Tab remains inside history', await page.evaluate(() => Boolean(document.activeElement?.closest('#professional-history-modal'))))
      check('monthly table summary participates in keyboard navigation', await page.evaluate(() => document.activeElement?.tagName === 'SUMMARY'))
      await page.keyboard.press('Tab')
      check('forward Tab remains inside history', await page.evaluate(() => Boolean(document.activeElement?.closest('#professional-history-modal'))))
      await page.keyboard.press('Escape'); await modal.waitFor({ state: 'hidden' })
      check('Escape restores trigger focus', await trigger.evaluate(element => document.activeElement === element))
      await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()
      check('clear restores all rows', await page.locator('.mp-person').count() === 6)
      await page.getByLabel('Data inicial', { exact: true }).fill('2026-11-01')
      await page.getByLabel('Data final', { exact: true }).fill('2026-10-01')
      check('inverted period explains error and returns no rows', await page.locator('#registros-periodo-ajuda').getAttribute('role') === 'alert' && await page.locator('.mp-person').count() === 0)
      await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click()
      if (width === 1440 && colorScheme === 'light') {
        failRecords = true
        await trigger.click(); await modal.locator('.rh-error').waitFor()
        check('failed reauthorization hides prior details', await modal.locator('.rh-evaluation').count() === 0 && !(await modal.innerText()).includes('synthetic private detail'))
        failRecords = false
        await modal.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
        await modal.locator('.rh-evaluation').first().waitFor()
        check('retry recovers history', await modal.locator('.rh-evaluation').count() === 4)
        await close.click(); await modal.waitFor({ state: 'hidden' })
        allowedRecords = []
        await trigger.click()
        await modal.getByText('Não há avaliações disponíveis para este profissional.', { exact: true }).waitFor()
        check('changed authorization removes detailed history', await modal.locator('.rh-evaluation').count() === 0)
        await close.click()
        admin = false; allowedRecords = records.filter(record => record.colab_id === 101)
        await page.goto(origin + '/registros')
        await page.waitForFunction(() => document.querySelectorAll('.mp-person').length === 4)
        check('evaluator has no administrative actions', await page.locator('.mp-delete, #exportar').count() === 0)
      }
    } finally { await context.close() }
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, captures, errors, completedUtc: new Date().toISOString() }, null, 2))
  console.log(JSON.stringify({ passed: checks.length, captures: captures.length, errors: errors.length, output }))
} finally { await browser.close() }
