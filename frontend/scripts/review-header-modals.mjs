// All HTTP API calls are mocked. No real sessions, passwords or database access.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

assert.ok(process.env.EVAL_VISUAL_TOOL_DIRECTORY, 'Configure EVAL_VISUAL_TOOL_DIRECTORY with an existing playwright-core installation.')
const require = createRequire(path.resolve(process.env.EVAL_VISUAL_TOOL_DIRECTORY, 'package.json'))
const { chromium } = require('playwright-core')
const origin = 'http://localhost:5173'
const output = path.resolve('frontend/node_modules/.cache/header-modals-review')
await fs.mkdir(output, { recursive: true })
const checks = [], errors = []
const user = { id: 1, name: 'Administrador fictício', email: 'admin@example.invalid', admin: true }
const professionals = [{ id: 1, colab: 'Profissional Alfa', demandante: 'reviewer@example.invalid' }]
const records = [{ id: 1, colab: 'Profissional Alfa', created_at: '2026-10-26T12:00:00.000Z', avaliacao: 5, nivel: 'A' }]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
    for (const [name, width, height, system] of [['desktop', 1440, 1000, 'light'], ['mobile', 390, 844, 'light'], ['compact', 320, 740, 'light'], ['tablet', 768, 1024, 'light'], ['system-dark', 1440, 1000, 'dark']]) {
        let signedIn = true, failLogout = true
        const writes = []
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: system })
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url())
            if (url.origin === origin) return route.continue()
            if (url.origin !== 'http://localhost:8001') return route.abort()
            const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
                'access-control-allow-headers': 'content-type,x-csrf-token', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
            const reply = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) })
            if (request.method() === 'OPTIONS') return reply({})
            if (url.pathname === '/session') return reply(signedIn ? user : {}, signedIn ? 200 : 401)
            if (url.pathname === '/csrf-token') return reply({ csrfToken: 'c'.repeat(64) })
            if (url.pathname === '/signout' && request.method() === 'POST') {
                if (failLogout) return reply({}, 500)
                signedIn = false; return reply({})
            }
            if (request.method() !== 'GET') writes.push(`${request.method()} ${url.pathname}`)
            if (url.pathname === '/colab') return reply(professionals)
            if (url.pathname === '/registros') return reply(records)
            throw new Error(`Unexpected mocked endpoint: ${request.method()} ${url.pathname}`)
        })
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        const account = () => page.getByRole('button', { name: 'Minha conta', exact: true })
        const dark = () => page.locator('html').evaluate(el => el.classList.contains('dark'))
        async function fit() { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false) }
        async function capture(label) { await fit(); await page.screenshot({ path: path.join(output, `${name}-${label}.png`) }) }
        async function goto(route) { await page.goto(origin + route); await account().waitFor() }
        await goto('/')
        assert.equal(await dark(), system === 'dark')
        await page.getByRole('button', { name: /Ativar tema/ }).click()
        const chosen = system !== 'dark'
        assert.equal(await dark(), chosen)
        await page.reload(); await account().waitFor()
        assert.equal(await dark(), chosen)
        assert.equal(await page.evaluate(() => localStorage.getItem('evaluation-theme')), chosen ? 'dark' : 'light')
        await page.emulateMedia({ colorScheme: system === 'light' ? 'dark' : 'light' })
        assert.equal(await dark(), chosen)
        checks.push(`${name}: system initialization, toggle, persistence and explicit choice overrides OS`)

        for (const theme of ['light', 'dark']) {
            if (await dark() !== (theme === 'dark')) await page.getByRole('button', { name: /Ativar tema/ }).click()
            await account().click()
            await page.locator('#account-dropdown').getByText(user.email, { exact: true }).waitFor()
            await capture(`${theme}-account`)
            await page.keyboard.press('Escape')
            assert.equal(await account().getAttribute('aria-expanded'), 'false')
            assert.equal(await account().evaluate(el => el === document.activeElement), true)
            await account().press('ArrowDown')
            assert.equal(await page.locator('#account-dropdown a').evaluate(el => el === document.activeElement), true)
            await page.keyboard.press('Tab')
            assert.equal(await page.getByRole('button', { name: 'Sair', exact: true }).evaluate(el => el === document.activeElement), true)
            await page.keyboard.press('Tab')
            await page.locator('#account-dropdown').waitFor({ state: 'hidden' })
            await account().click()
            await page.locator('.header-logo').click()
            await page.locator('#account-dropdown').waitFor({ state: 'hidden' })
            await account().click()
            await page.getByRole('link', { name: 'Alterar senha', exact: true }).click()
            await page.waitForURL('**/senha')
            assert.equal(await dark(), theme === 'dark')
            await page.locator('#account-dropdown').waitFor({ state: 'hidden' })
            await goto('/')
            checks.push(`${name}/${theme}: account keyboard, focus, outside click and password navigation`)
            for (const [index, id] of [[0, 'qualidade-modal'], [2, 'dispon-modal']]) {
                await page.locator('.evaluation-criterion').nth(index).locator('svg.vue-star-rating-star').nth(2).click({ position: { x: 20, y: 12 } })
                const dialog = page.locator(`#${id}`)
                await dialog.waitFor({ state: 'visible' })
                const bounds = await dialog.locator('.app-modal-panel').boundingBox()
                assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height + 1)
                await capture(`${theme}-${id}`)
                await dialog.getByRole('button', { name: 'OK', exact: true }).focus()
                await page.keyboard.press('Tab')
                assert.equal(await dialog.locator('input').first().evaluate(el => el === document.activeElement), true)
                await page.keyboard.press('Escape')
                await dialog.waitFor({ state: 'hidden' })
            }
            await page.getByLabel('Profissional Alfa', { exact: true }).check()
            const review = page.getByRole('button', { name: 'Resumo', exact: true })
            await review.click()
            await page.getByRole('dialog').getByText('1 - Profissional Alfa', { exact: true }).waitFor()
            await capture(`${theme}-review`)
            await page.keyboard.press('Escape')
            assert.equal(await review.evaluate(el => el === document.activeElement), true)
            for (const route of ['/colabs', '/registros']) {
                await goto(route)
                await page.locator('.mp-delete').first().click()
                const dialog = page.getByRole('dialog')
                await dialog.waitFor()
                await capture(`${theme}-delete${route.replace('/', '-')}`)
                await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
                await dialog.waitFor({ state: 'hidden' })
                assert.equal(await page.locator('.mp-delete').first().evaluate(el => el === document.activeElement), true)
            }
            checks.push(`${name}/${theme}: four modal types, viewport fit, focus trap, Escape and cancel`)
            await page.goto(origin + '/login')
            await page.getByRole('heading', { name: 'Entrar no sistema', exact: true }).waitFor()
            assert.equal(await dark(), theme === 'dark')
            await goto('/')
        }
        await account().click()
        await page.getByRole('button', { name: 'Sair', exact: true }).click()
        await page.locator('#account-dropdown [role="alert"]').waitFor()
        assert.equal(new URL(page.url()).pathname, '/')
        failLogout = false
        await page.getByRole('button', { name: 'Sair', exact: true }).click()
        await page.waitForURL('**/login')
        assert.equal(await account().count(), 0)
        assert.deepEqual(writes, [])
        checks.push(`${name}: failed logout preserves account; successful logout removes private header; no business writes`)
        await context.close()
    }
    assert.deepEqual(errors, [])
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2))
    console.log(JSON.stringify({ passed: checks.length, errors: errors.length, output }))
} finally { await browser.close() }
