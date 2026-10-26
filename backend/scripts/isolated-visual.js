// Optional real-browser review. Playwright is installed separately in an approved temporary folder.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { randomBytes, createHmac } = require('node:crypto')

async function review({ profile, startApplication }) {
    const toolDirectory = process.env.EVAL_VISUAL_TOOL_DIRECTORY
    assert.ok(toolDirectory && path.isAbsolute(toolDirectory))
    const { chromium } = require(path.join(toolDirectory, 'node_modules/playwright-core'))
    const cache = path.resolve(__dirname, '../../frontend/node_modules/.cache')
    fs.mkdirSync(cache, { recursive: true })
    const folder = path.join(cache, 'visual-review-' + randomBytes(6).toString('hex'))
    fs.mkdirSync(folder, { recursive: false })
    const report = { folder, database: profile.database,
        playwrightVersion: require(path.join(toolDirectory, 'node_modules/playwright-core/package.json')).version,
        checks: [], captures: [], unexpectedPageErrors: 0, blockedBusinessWrites: [], simulatedDeletes: [], externalRequestsBlocked: 0 }
    const check = (name, passed, details) => report.checks.push({ name, passed: Boolean(passed), ...(details ? { details } : {}) })
    let browser, runtime, step = 'start'
    try {
        runtime = await startApplication(profile, 8001)
        const digest = value => createHmac('sha256', process.env.AUTH_RATE_LIMIT_SECRET).update(JSON.stringify(value)).digest('hex')
        const keys = ['csrf-ip', 'signin-ip'].map(prefix => prefix + ':' + digest('127.0.0.1'))
        for (const email of ['reviewer@example.invalid', 'admin@example.invalid', 'absent@example.invalid']) {
            keys.push('signin-pair:' + digest(['127.0.0.1', email]))
        }
        await runtime.db('auth_rate_limits').whereIn('key', keys).update({ expire: 0 })
        browser = await chromium.launch({ channel: 'chrome', headless: true })
        report.chromeVersion = browser.version()
        const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: 'light', locale: 'pt-BR' })
        const page = await context.newPage()
        page.setDefaultTimeout(10000)
        page.on('pageerror', () => { report.unexpectedPageErrors++ })
        let simulated = ''
        let simulatedDelete = null
        await context.route('**/*', async route => {
            const request = route.request(), url = new URL(request.url())
            if (!['http://localhost:5173', 'http://localhost:8001'].includes(url.origin)) {
                report.externalRequestsBlocked++; return route.abort()
            }
            if (url.origin.endsWith(':8001')) {
                if (request.method() === 'DELETE' && simulatedDelete &&
                    new RegExp('^' + simulatedDelete.prefix + '[0-9]+$').test(url.pathname)) {
                    report.simulatedDeletes.push({ resource: simulatedDelete.prefix, status: simulatedDelete.status })
                    return route.fulfill({ status: simulatedDelete.status,
                        body: simulatedDelete.status === 204 ? '' : 'Falha fictícia.',
                        headers: { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Credentials': 'true' } })
                }
                if (request.method() === 'GET' && url.pathname === '/colab' && simulated) {
                    return route.fulfill({ status: simulated === 'error' ? 503 : 200, contentType: 'application/json', body: simulated === 'error' ? '{}' : '[]',
                        headers: { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Credentials': 'true' } })
                }
                if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !['/signin', '/signout'].includes(url.pathname)) {
                    report.blockedBusinessWrites.push({ method: request.method(), path: url.pathname })
                    return route.abort()
                }
            }
            return route.continue()
        })
        const goto = async url => { await page.goto('http://localhost:5173' + url); await page.waitForLoadState('networkidle') }
        const capture = async name => {
            const emptyPasswords = await page.locator('input[type="password"]').evaluateAll(fields => fields.every(field => !field.value))
            await page.screenshot({ path: path.join(folder, name + '.png'), fullPage: true,
                mask: emptyPasswords ? [] : [page.locator('input[type="password"]')], maskColor: '#d1d5db' })
            report.captures.push(name + '.png')
        }
        const fit = async name => {
            const details = await page.evaluate(() => ({ viewport: innerWidth, pageWidth: document.documentElement.scrollWidth,
                headerRight: Math.max(0, ...[...document.querySelectorAll('header header > div img, header header > div a, header header > div p, header header > div button')]
                    .map(el => el.getBoundingClientRect().right)),
                articleWidth: document.querySelector('.home article')?.getBoundingClientRect().width || null,
                overflowingCards: [...document.querySelectorAll('.home .star-title')].map(el => el.parentElement)
                    .filter(el => el.scrollWidth > el.clientWidth + 1).length }))
            check(name, details.pageWidth <= details.viewport + 1 && details.headerRight <= details.viewport + 1 &&
                (details.articleWidth === null || details.articleWidth >= 280) && details.overflowingCards === 0, details)
        }
        const signin = async (email, password) => {
            await goto('/login')
            await page.getByLabel('E-mail', { exact: true }).fill(email)
            await page.getByLabel('Senha', { exact: true }).fill(password)
            await page.getByRole('button', { name: 'Entrar', exact: true }).click()
            await page.waitForURL('http://localhost:5173/')
            await page.waitForLoadState('networkidle')
        }
        step = 'login'
        await goto('/registros')
        check('anonymous-private-redirect', new URL(page.url()).pathname === '/login')
        await capture('01-login-desktop')
        await page.getByLabel('E-mail', { exact: true }).fill('absent@example.invalid')
        await page.getByLabel('Senha', { exact: true }).fill('Incorrect-fictitious-passphrase')
        await page.getByRole('button', { name: 'Entrar', exact: true }).click()
        await page.getByRole('alert').filter({ hasText: 'E-mail ou senha inválidos.' }).waitFor()
        check('login-generic-error', true)
        await capture('02-login-error')
        await page.setViewportSize({ width: 390, height: 844 })
        await capture('03-login-mobile')
        await fit('login-mobile-fits')
        await page.setViewportSize({ width: 1366, height: 900 })

        step = 'reviewer'
        await signin('reviewer@example.invalid', process.env.EVAL_ISOLATED_EVALUATOR_PASSWORD)
        const names = await page.locator('.line-colabs label').allTextContents()
        check('reviewer-only-own-professional', names.length === 1 && names[0].trim() === 'Profissional fictício A')
        check('reviewer-admin-link-hidden', await page.getByRole('link', { name: 'Inserir profissional', exact: true }).count() === 0)
        await capture('04-reviewer-home-desktop')
        await fit('home-desktop-fits')
        await page.getByLabel('Profissional fictício A', { exact: true }).check()
        const summary = page.getByRole('button', { name: 'Resumo', exact: true })
        await summary.click()
        await page.locator('#default-modal').waitFor({ state: 'visible' })
        await capture('05-reviewer-summary')
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Tab')
        check('summary-focus-trap', await page.locator('#default-modal').evaluate(el => el.contains(document.activeElement)))
        await page.keyboard.press('Escape')
        check('summary-escape-and-focus', !await page.locator('#default-modal').isVisible() && await summary.evaluate(el => el === document.activeElement))
        await page.getByRole('button', { name: 'Submeter Avaliação', exact: true }).click()
        check('submission-stays-disabled', report.blockedBusinessWrites.length === 0)

        for (const url of ['/colabs', '/registros']) {
            step = 'reviewer-' + url.slice(1)
            await goto(url)
            await capture('06-reviewer-' + url.slice(1) + '-desktop')
            const dialogs = page.locator('#exampleModal, #delete-colab-modal, #delete-registro-modal')
            check('reviewer-' + url.slice(1) + '-no-confirmation-visible', await dialogs.count() === 0)
        }
        await page.locator('input[type="text"]').first().fill('Nao existe ficticio')
        await page.getByText('Não há dados disponíveis', { exact: true }).waitFor()
        check('records-empty-search-state', true)
        await capture('07-records-empty-filter')
        await goto('/senha')
        check('password-fields-labelled', await page.getByLabel('Senha atual', { exact: true }).count() === 1 &&
            await page.getByLabel('Nova senha (15 a 128 caracteres)', { exact: true }).count() === 1)
        await capture('08-password-desktop')
        await page.setViewportSize({ width: 390, height: 844 })
        await capture('09-password-mobile')
        await goto('/')
        await capture('10-reviewer-home-mobile')
        await fit('home-mobile-fits')
        check('home-mobile-footer-after-controls', await page.locator('#footer').evaluate(el =>
            el.getBoundingClientRect().top >= document.querySelector('#submit').getBoundingClientRect().bottom))
        await page.getByRole('button', { name: 'Resumo', exact: true }).click()
        await page.locator('#default-modal').waitFor({ state: 'visible' })
        await capture('10-reviewer-summary-mobile')
        check('summary-mobile-content-fits', await page.locator('#default-modal').evaluate(el =>
            el.scrollWidth <= el.clientWidth + 1))
        await page.keyboard.press('Escape')
        const menu = page.getByRole('button', { name: 'Abrir menu principal' })
        await menu.click()
        for (const width of [320, 768]) {
            await page.setViewportSize({ width, height: 900 })
            await capture('11-home-width-' + width)
            await fit('home-width-' + width + '-fits')
        }
        await page.setViewportSize({ width: 390, height: 844 })
        check('mobile-menu-expands', await menu.getAttribute('aria-expanded') === 'true' && await page.getByRole('link', { name: 'Registros', exact: true }).isVisible())
        await capture('11-mobile-menu')
        await menu.click()
        await page.getByRole('button', { name: 'Sair', exact: true }).click()
        await page.waitForURL('**/login')
        check('logout-unmounts-private-header', await page.getByRole('button', { name: 'Sair', exact: true }).count() === 0)

        step = 'admin'
        await page.setViewportSize({ width: 1366, height: 900 })
        await signin('admin@example.invalid', process.env.EVAL_ISOLATED_ADMIN_PASSWORD)
        check('admin-navigation-visible', await page.getByRole('link', { name: 'Inserir profissional', exact: true }).count() === 1)
        await capture('12-admin-home-desktop')
        await page.emulateMedia({ colorScheme: 'dark' })
        await capture('13-admin-home-dark')
        const contrast = await page.locator('.demandante').first().evaluate(el => {
            const foreground = getComputedStyle(el).color
            const background = getComputedStyle(el.closest('header').firstElementChild).backgroundColor
            const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
                const channel = value / 255
                return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
            }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
            const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b)
            return { foreground, background, ratio: Number(((values[1] + 0.05) / (values[0] + 0.05)).toFixed(2)) }
        })
        check('dark-identity-contrast', contrast.ratio >= 4.5, contrast)
        await page.emulateMedia({ colorScheme: 'light' })
        await goto('/inserir')
        await capture('14-admin-insert-desktop')
        const duplicateIds = await page.evaluate(() => {
            const ids = [...document.querySelectorAll('[id]')].map(el => el.id)
            return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
        })
        check('insert-unique-control-ids', duplicateIds.length === 0, { duplicateIds })
        await page.getByText('Matrícula:', { exact: true }).click()
        check('registration-label-focus', await page.getByLabel('Matrícula:', { exact: true }).evaluate(el => el === document.activeElement))
        await page.setViewportSize({ width: 390, height: 844 })
        await capture('14-admin-insert-mobile')
        await page.setViewportSize({ width: 1366, height: 900 })
        for (const url of ['/colabs', '/registros']) {
            step = 'admin-' + url.slice(1)
            await goto(url)
            await capture('15-admin-' + url.slice(1) + '-desktop')
            const dialog = page.locator(url === '/colabs' ? '#delete-colab-modal' : '#delete-registro-modal')
            const trigger = page.getByRole('button', { name: /^Remover (profissional|registro de) / }).first()
            check('admin-' + url.slice(1) + '-confirmation-initially-hidden', await dialog.count() === 1 && !await dialog.isVisible())
            await trigger.focus()
            await page.keyboard.press('Enter')
            await dialog.waitFor({ state: 'visible' })
            check('admin-' + url.slice(1) + '-confirmation-opens', await dialog.isVisible())
            await capture('16-admin-' + url.slice(1) + '-confirmation')
            await page.keyboard.press('Shift+Tab')
            await page.keyboard.press('Tab')
            check('admin-' + url.slice(1) + '-focus-trap', await dialog.evaluate(el => el.contains(document.activeElement)))
            await page.keyboard.press('Escape')
            await dialog.waitFor({ state: 'hidden' })
            check('admin-' + url.slice(1) + '-escape-restores-focus', await trigger.evaluate(el => el === document.activeElement))
            await page.keyboard.press('Enter')
            await dialog.waitFor({ state: 'visible' })
            await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
            await dialog.waitFor({ state: 'hidden' })
            check('admin-' + url.slice(1) + '-cancel-closes', !await dialog.isVisible())
            check('admin-' + url.slice(1) + '-cancel-restores-focus', await trigger.evaluate(el => el === document.activeElement))
            await trigger.click()
            await dialog.waitFor({ state: 'visible' })
            // Trigger Vue Router navigation while a modal is open to exercise unmount cleanup.
            await page.locator('a[href="/senha"]').evaluate(el => el.click())
            await page.waitForURL('**/senha')
            check('admin-' + url.slice(1) + '-unmount-cleans-backdrop', await page.evaluate(() =>
                !document.body.classList.contains('overflow-hidden') && !document.querySelector('[class~="bg-gray-900/50"]')))
            await goto(url)
            const initialRows = await page.locator('.operation-icon').count()
            for (const status of [503, 204]) {
                simulatedDelete = { prefix: url === '/colabs' ? '/colab/' : '/registros/', status }
                await trigger.click()
                await dialog.waitFor({ state: 'visible' })
                await dialog.getByRole('button', { name: 'Sim', exact: true }).click()
                await dialog.waitFor({ state: 'hidden' })
                if (status === 503) {
                    await page.getByText(url === '/colabs' ? 'Não foi possível remover o profissional.' : 'Não foi possível remover o registro.', { exact: true }).waitFor()
                    check('admin-' + url.slice(1) + '-simulated-delete-failure-preserves-list', await page.locator('.operation-icon').count() === initialRows)
                } else {
                    await page.waitForFunction(count => document.querySelectorAll('.operation-icon').length === count, initialRows - 1)
                    check('admin-' + url.slice(1) + '-simulated-delete-success-updates-list', true)
                }
            }
            simulatedDelete = null
            await page.reload()
            await page.waitForLoadState('networkidle')
            check('admin-' + url.slice(1) + '-database-rows-unchanged', await page.locator('.operation-icon').count() === initialRows)
            await page.setViewportSize({ width: 390, height: 844 })
            await capture('17-admin-' + url.slice(1) + '-mobile')
            await page.setViewportSize({ width: 1366, height: 900 })
        }
        step = 'list-states'
        simulated = 'empty'
        await goto('/colabs')
        await page.getByText('Não há dados disponíveis', { exact: true }).waitFor()
        check('professionals-simulated-empty-state', true)
        await capture('18-professionals-empty')
        await goto('/senha')
        simulated = 'error'
        await goto('/colabs')
        await page.getByText('Não foi possível carregar os profissionais.', { exact: true }).waitFor()
        check('professionals-simulated-service-error', true)
        await capture('19-professionals-service-error')
        simulated = ''
        await page.getByRole('button', { name: 'Sair', exact: true }).click()
        await page.waitForURL('**/login')
        check('no-unexpected-page-errors', report.unexpectedPageErrors === 0)
        check('no-business-write-attempts', report.blockedBusinessWrites.length === 0)
        report.executionCompleted = true
        report.acceptancePassed = report.checks.every(item => item.passed)
        report.completedUtc = new Date().toISOString()
    } catch (error) {
        report.executionCompleted = false
        report.failedStep = step
        report.failureType = error.name
        // Do not print Playwright diagnostics, which can include filled credentials.
    } finally {
        if (browser) await browser.close()
        if (runtime) await runtime.close()
        fs.writeFileSync(path.join(folder, 'report.json'), JSON.stringify(report, null, 2))
    }
    return report
}

module.exports = { review }
