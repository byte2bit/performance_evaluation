// Opt-in UI checks. Every API request is mocked; no credentials or database access.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const toolDirectory = process.env.EVAL_VISUAL_TOOL_DIRECTORY
assert.ok(toolDirectory, 'Configure EVAL_VISUAL_TOOL_DIRECTORY with an existing playwright-core installation.')
const require = createRequire(path.resolve(toolDirectory, 'package.json'))
const { chromium } = require('playwright-core')
const origin = 'http://localhost:5173'
const output = path.resolve('frontend/node_modules/.cache/management-review')
await fs.mkdir(output, { recursive: true })
const checks = []
const errors = []
const professionals = [
    { id: 1, matricula: 'F001', colab: 'Profissional Alfa', ppu: '1.1', servico: 'Engenharia', funcao: 'Analista', liderancas: 'Liderança fictícia', gerencia: 'Gerência técnica', demandante: 'reviewer@example.invalid' },
    { id: 2, matricula: 'F002', colab: 'Profissional Beta', ppu: '1.2', servico: 'Planejamento', funcao: 'Especialista', liderancas: 'Liderança fictícia', gerencia: 'Gerência de projetos', demandante: 'reviewer@example.invalid' },
]
const records = professionals.map((row, i) => ({ id: i + 1, colab_id: row.id, colab: row.colab,
    created_at: '2026-10-26T12:00:00.000Z', avaliacao: 4.5, nivel: 'Bom', desconto: 0,
    nota_qualidade: 4.5, nota_prazo: 5, nota_dispon: 4, nota_respon: 4.5,
    obs_qualidade: 'Atendeu aos critérios previstos.', obs_prazo: '', obs_dispon: '', obs_respon: '',
    itensQualidade: '', itensDispon: '', liderancas: row.liderancas, demandante: 'original@example.invalid' }))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
    for (const scenario of [
        { name: 'desktop', viewport: { width: 1440, height: 1000 }, colorScheme: 'light' },
        { name: 'mobile', viewport: { width: 390, height: 844 }, colorScheme: 'light' },
        { name: 'compact', viewport: { width: 320, height: 740 }, colorScheme: 'light' },
        { name: 'tablet', viewport: { width: 768, height: 1024 }, colorScheme: 'light' },
        { name: 'dark', viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' },
    ]) {
        let admin = true, empty = false, failSave = false, failDelete = false
        const mutations = []
        const context = await browser.newContext({ viewport: scenario.viewport, colorScheme: scenario.colorScheme })
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url())
            if (url.origin === origin) return route.continue()
            if (url.origin !== 'http://localhost:8001') return route.abort()
            const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
                'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS' }
            const reply = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) })
            if (request.method() === 'OPTIONS') return reply({})
            if (url.pathname === '/session') return reply({ id: 1, name: 'Administrador fictício', email: 'admin@example.invalid', admin })
            if (url.pathname === '/csrf-token') return reply({ csrfToken: 'a'.repeat(64) })
            if (request.method() === 'DELETE') { mutations.push(request.url()); return reply({}, failDelete ? 500 : 200) }
            if (request.method() === 'POST' && url.pathname === '/colab') {
                mutations.push(request.postDataJSON()); return reply({}, failSave ? 500 : 201)
            }
            if (url.pathname === '/colab') return reply(empty ? [] : professionals)
            if (url.pathname === '/registros') return reply(empty ? [] : records)
            throw new Error(`Unexpected mocked API endpoint: ${request.method()} ${url.pathname}`)
        })
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        for (const [route, title] of [['registros', 'Registros'], ['colabs', 'Lista de profissionais'], ['inserir', 'Inserir profissional']]) {
            await page.goto(`${origin}/${route}`)
            await page.getByRole('heading', { level: 1, name: title, exact: true }).waitFor()
            if (route !== 'inserir') await page.locator('.mp-person').first().waitFor()
            await page.screenshot({ path: path.join(output, `${scenario.name}-${route}.png`), fullPage: true })
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${scenario.name}/${route}: page overflow`)
            checks.push(`${scenario.name}/${route}: render and no page overflow`)
            if (route === 'inserir') continue
            const previous = await page.locator('.previous-page__click-button').boundingBox()
            const next = await page.locator('.next-page__click-button').boundingBox()
            assert.equal(previous.y, next.y, `${scenario.name}/${route}: pagination arrows aligned`)
            const search = page.getByRole('searchbox')
            await search.fill('Beta')
            await page.getByText('Profissional Alfa', { exact: true }).waitFor({ state: 'hidden' })
            assert.equal(await page.locator('.mp-person').count(), 1)
            await search.fill('Inexistente')
            await page.getByText('Não há dados disponíveis', { exact: true }).waitFor()
            await search.fill('')
            await page.locator('.mp-delete').first().click()
            const dialog = page.getByRole('dialog')
            await dialog.waitFor()
            await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
            await dialog.waitFor({ state: 'hidden' })
            assert.equal(mutations.length, 0)
            checks.push(`${scenario.name}/${route}: search, empty result, cancel deletion`)
        }
        if (scenario.name === 'desktop') {
            await page.getByLabel('Nome do profissional', { exact: true }).fill('Cadastro fictício')
            await page.getByLabel('Matrícula', { exact: true }).fill('F003')
            await page.getByLabel('Demandante', { exact: true }).fill('reviewer@example.invalid')
            failSave = true
            await page.getByRole('button', { name: 'Enviar', exact: true }).click()
            await page.getByText('Não foi possível registrar o profissional. Tente novamente.', { exact: true }).waitFor()
            assert.equal(await page.getByLabel('Nome do profissional', { exact: true }).inputValue(), 'Cadastro fictício')
            failSave = false
            await page.getByRole('button', { name: 'Enviar', exact: true }).click()
            await page.waitForFunction(() => document.querySelector('#profissional').value === '')
            assert.equal(mutations.at(-1).matricula, 'F003')
            assert.equal(mutations.at(-1).demandante, 'reviewer@example.invalid')
            checks.push('form: failed save preserves input; successful save sends payload and resets')
            for (const route of ['registros', 'colabs']) {
                await page.goto(`${origin}/${route}`)
                await page.locator('.mp-delete').first().click()
                failDelete = true
                await page.getByRole('dialog').getByRole('button', { name: 'Sim', exact: true }).click()
                await page.getByText(/Não foi possível remover/).waitFor()
                assert.equal(await page.locator('.mp-person').count(), 2)
                failDelete = false
                await page.locator('.mp-delete').first().click()
                await page.getByRole('dialog').getByRole('button', { name: 'Sim', exact: true }).click()
                await page.waitForFunction(() => document.querySelectorAll('.mp-person').length === 1)
                checks.push(`${route}: deletion failure preserves rows; confirmation updates list on success`)
            }
            admin = false
            for (const route of ['registros', 'colabs']) {
                await page.goto(`${origin}/${route}`)
                await page.locator('.mp-person').first().waitFor()
                assert.equal(await page.locator('.mp-delete, #exportar').count(), 0)
                assert.equal(await page.locator('main a[href="/inserir"]').count(), 0)
                checks.push(`${route}: administrator actions hidden for evaluator`)
            }
            admin = true; empty = true
            for (const route of ['registros', 'colabs']) {
                await page.goto(`${origin}/${route}`)
                await page.getByText('Não há dados disponíveis', { exact: true }).waitFor()
                checks.push(`${route}: empty list renders`)
            }
        }
        await context.close()
    }
    assert.deepEqual(errors, [])
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2))
    console.log(JSON.stringify({ passed: checks.length, errors: errors.length, output }))
} finally { await browser.close() }
