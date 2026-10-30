// Anonymous preview smoke test only. Never types credentials or opens records.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const toolDirectory = process.env.EVAL_VISUAL_TOOL_DIRECTORY
assert.ok(toolDirectory, 'An existing local playwright-core installation is required')
const require = createRequire(path.resolve(toolDirectory, 'package.json'))
const { chromium } = require('playwright-core')
const output = path.resolve('frontend/node_modules/.cache/inova-preview-review')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = [], requests = [], captures = []
try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
        const context = await browser.newContext({ viewport: { width, height } })
        await context.route('**/*', route => {
            const url = new URL(route.request().url())
            if (!['http://localhost:5174', 'http://localhost:8002'].includes(url.origin)) return route.abort()
            requests.push({ origin: url.origin, method: route.request().method(), pathname: url.pathname })
            return route.continue()
        })
        const page = await context.newPage()
        page.on('pageerror', () => errors.push('PAGE_ERROR'))
        await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle' })
        await page.getByRole('heading', { name: 'Entrar no sistema', exact: true }).waitFor()
        assert.equal(await page.getByLabel('E-mail', { exact: true }).inputValue(), '')
        assert.equal(await page.getByLabel('Senha', { exact: true }).inputValue(), '')
        assert.equal(await page.getByRole('button', { name: 'Entrar', exact: true }).isEnabled(), true)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        const name = `login-${width}.png`
        await page.screenshot({ path: path.join(output, name), fullPage: true }); captures.push(name)
        await context.close()
    }
    assert.equal(errors.length, 0)
    assert.equal(requests.some(row => row.method === 'POST'), false)
    assert.equal(requests.some(row => row.origin === 'http://localhost:8002' && /^\/(registros2?|colab|demandantes|gerencias)(?:\/|$)/.test(row.pathname)), false)
    const report = { success: true, viewportWidths: [1440, 390], anonymousOnly: true, credentialsTyped: false, operationalLoginsAttempted: 0,
        pageErrors: 0, externalRequestsBlocked: true, captures, completedUtc: new Date().toISOString() }
    await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
} finally { await browser.close() }
