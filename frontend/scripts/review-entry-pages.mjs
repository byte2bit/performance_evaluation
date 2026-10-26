// Opt-in Chrome checks: all API responses are synthetic, with external traffic blocked.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

assert.ok(process.env.EVAL_VISUAL_TOOL_DIRECTORY, 'Configure EVAL_VISUAL_TOOL_DIRECTORY with an existing playwright-core installation.')
const require = createRequire(path.resolve(process.env.EVAL_VISUAL_TOOL_DIRECTORY, 'package.json'))
const { chromium } = require('playwright-core')
const origin = 'http://localhost:5173'
const output = path.resolve('frontend/node_modules/.cache/entry-pages-review')
await fs.mkdir(output, { recursive: true })
const checks = [], errors = []
const user = { id: 1, name: 'Avaliador fictício', email: 'reviewer@example.invalid', admin: false }
const professionals = [{ id: 1, colab: 'Profissional Alfa' }, { id: 2, colab: 'Profissional Beta' }]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
    for (const scenario of [
        { name: 'desktop', viewport: { width: 1440, height: 1000 }, colorScheme: 'light' },
        { name: 'mobile', viewport: { width: 390, height: 844 }, colorScheme: 'light' },
        { name: 'compact', viewport: { width: 320, height: 740 }, colorScheme: 'light' },
        { name: 'tablet', viewport: { width: 768, height: 1024 }, colorScheme: 'light' },
        { name: 'dark', viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' },
    ]) {
        let authenticated = false, failLogin = true, releaseLogin
        const pendingLogin = new Promise(resolve => { releaseLogin = resolve })
        const calls = []
        const context = await browser.newContext({ viewport: scenario.viewport, colorScheme: scenario.colorScheme })
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url())
            if (url.origin === origin) return route.continue()
            if (url.origin !== 'http://localhost:8001') return route.abort()
            const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
                'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
            const reply = (data, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(data) })
            if (request.method() === 'OPTIONS') return reply({})
            calls.push(`${request.method()} ${url.pathname}`)
            if (url.pathname === '/session') return reply(authenticated ? user : {}, authenticated ? 200 : 401)
            if (url.pathname === '/csrf-token') return reply({ csrfToken: 'b'.repeat(64) })
            if (url.pathname === '/signin' && request.method() === 'POST') {
                await pendingLogin
                if (failLogin) return reply({}, 401)
                authenticated = true
                return reply(user)
            }
            if (url.pathname === '/colab' && request.method() === 'GET') return reply(professionals)
            throw new Error(`Unexpected API request: ${request.method()} ${url.pathname}`)
        })
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        async function capture(name) {
            const passwordsEmpty = await page.locator('input[type="password"]').evaluateAll(fields => fields.every(field => !field.value))
            await page.screenshot({ path: path.join(output, `${scenario.name}-${name}.png`), fullPage: true,
                mask: passwordsEmpty ? [] : [page.locator('input[type="password"]')], maskColor: '#dce3ed' })
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${scenario.name}/${name}: page overflow`)
        }
        await page.goto(`${origin}/login`)
        await page.getByRole('heading', { name: 'Entrar no sistema', exact: true }).waitFor()
        await capture('login')
        await page.getByLabel('E-mail', { exact: true }).fill(user.email)
        await page.getByLabel('Senha', { exact: true }).fill('synthetic-password-only')
        await page.getByRole('button', { name: 'Entrar', exact: true }).click()
        await page.getByRole('button', { name: 'Entrando…', exact: true }).waitFor()
        assert.equal(await page.getByLabel('E-mail', { exact: true }).isDisabled(), true)
        assert.equal(await page.getByLabel('Senha', { exact: true }).isDisabled(), true)
        releaseLogin()
        await page.getByRole('alert').filter({ hasText: 'E-mail ou senha inválidos.' }).waitFor()
        assert.equal(await page.getByLabel('E-mail', { exact: true }).inputValue(), user.email)
        assert.equal(await page.getByLabel('Senha', { exact: true }).inputValue(), 'synthetic-password-only')
        await capture('login-error')
        checks.push(`${scenario.name}: login layout, pending state, failure message and preserved entries`)
        failLogin = false
        await page.getByRole('button', { name: 'Entrar', exact: true }).click()
        await page.waitForURL(origin + '/')
        await page.getByRole('heading', { level: 1, name: 'Avaliação de desempenho', exact: true }).waitFor()
        await page.getByLabel('Profissional Alfa', { exact: true }).waitFor()
        await capture('home')
        assert.equal(await page.locator('#media').inputValue(), '5')
        assert.equal(await page.locator('#nivel').inputValue(), 'A')
        assert.equal(await page.locator('#desconto').inputValue(), '0%')
        await page.getByLabel('Profissional Alfa', { exact: true }).check()
        await page.getByRole('status').filter({ hasText: 'Selecionados: 1' }).waitFor()
        await page.getByLabel('Todos', { exact: true }).check()
        await page.getByRole('status').filter({ hasText: 'Selecionados: 2' }).waitFor()
        for (const [index, modalId, checkboxId] of [[0, 'qualidade-modal', 'check-qualidade-1'], [2, 'dispon-modal', 'check-dispon-1']]) {
            await page.locator('.evaluation-criterion').nth(index).locator('svg.vue-star-rating-star').nth(2).click({ position: { x: 20, y: 12 } })
            const criteria = page.locator(`#${modalId}`)
            await criteria.waitFor({ state: 'visible' })
            await criteria.locator(`#${checkboxId}`).check()
            await criteria.getByRole('button', { name: 'OK', exact: true }).click()
            await criteria.waitFor({ state: 'hidden' })
        }
        assert.equal(await page.locator('#media').inputValue(), '4')
        assert.equal(await page.locator('#nivel').inputValue(), 'B')
        assert.equal(await page.locator('#desconto').inputValue(), '1%')
        checks.push(`${scenario.name}: stars, low-rating criteria dialogs and recalculation`)
        await page.locator('#obs_prazo').fill('Observação fictícia de prazo.')
        await page.getByRole('button', { name: 'Resumo', exact: true }).click()
        const dialog = page.getByRole('dialog')
        await dialog.getByText('1 - Profissional Alfa', { exact: true }).waitFor()
        await dialog.getByText('2 - Profissional Beta', { exact: true }).waitFor()
        await dialog.getByText('Observações de Prazo: Observação fictícia de prazo.', { exact: true }).waitFor()
        await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: 'Submeter Avaliação', exact: true }).click()
        assert.equal(calls.filter(call => call.startsWith('POST ') && call !== 'POST /signin').length, 0)
        checks.push(`${scenario.name}: home layout, selection, calculated values, summary and no evaluation submission`)
        if (scenario.name === 'desktop') {
            await page.goto(`${origin}/login?unavailable=1`)
            await page.getByRole('alert').filter({ hasText: 'Serviço indisponível. Tente novamente.' }).waitFor()
            await page.goto(`${origin}/login?passwordChanged=1`)
            await page.getByRole('status').filter({ hasText: 'Senha alterada. Entre novamente.' }).waitFor()
            checks.push('login: service unavailable and password changed notices')
        }
        await context.close()
    }
    assert.deepEqual(errors, [])
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2))
    console.log(JSON.stringify({ passed: checks.length, errors: errors.length, output }))
} finally { await browser.close() }
