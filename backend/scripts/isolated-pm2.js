const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')

async function main() {
    const id = crypto.randomBytes(12).toString('hex')
    const root = path.resolve(os.tmpdir(), `evaluation-pm2-${id}`)
    // Exclusive creation: never reuse a personal PM2 home or an existing profile.
    await fs.mkdir(root)
    await fs.writeFile(path.join(root, 'owner.json'), JSON.stringify({ id }), { flag: 'wx' })
    await fs.writeFile(path.join(root, 'fixture.cjs'), `
        const fs = require('node:fs')
        const path = require('node:path')
        fs.writeFileSync(path.join(process.env.EVALUATION_PM2_PROFILE, 'fixture-state.json'), JSON.stringify({
            pid: process.pid, value: process.env.SYNTHETIC_PM2_VALUE,
            hasSessionSecret: Boolean(process.env.SESSION_SECRET), hasSmtpPassword: Boolean(process.env.SMTP_PASSWORD)
        }))
        console.log('SYNTHETIC_PM2_READY')
        if (process.send) process.send('ready')
        setInterval(() => {}, 1000)
    `, { flag: 'wx' })

    // Allowlist, rather than passing the shell's credentials, NODE_OPTIONS,
    // PM2 overrides or database/SMTP configuration into children.
    const env = {}
    for (const name of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT']) {
        if (process.env[name]) env[name] = process.env[name]
    }
    const guard = path.resolve(__dirname, '../test/helpers/pm2-isolation.js')
    Object.assign(env, {
        // Keep the real temp root for profile validation in every child.
        TEMP: os.tmpdir(), TMP: os.tmpdir(),
        EVALUATION_PM2_PROFILE: root, EVALUATION_PM2_ID: id, EVALUATION_PM2_GUARD: '1',
        PM2_HOME: path.join(root, 'home'), PM2_NO_INTERACTION: 'true', PM2_DISABLE_VERSION_CHECK: 'true',
        PM2_PROGRAMMATIC: 'true', PM2_DISCRETE_MODE: 'true', NODE_ENV: 'test',
        NODE_OPTIONS: `--require "${guard.replace(/\\/g, '/')}"`
    })
    const probe = path.resolve(__dirname, '../test/helpers/pm2-probe.js')
    const run = args => new Promise((resolve, reject) => {
        execFile(process.execPath, [probe, ...args], {
            cwd: root, env, timeout: 45000, windowsHide: true, maxBuffer: 1024 * 1024
        }, async (error, stdout, stderr) => {
            if (error) {
                await fs.writeFile(path.join(root, 'probe-error.log'), stderr || 'Probe timed out or terminated.').catch(() => {})
                return reject(new Error('PM2_ISOLATED_PROBE_FAILED'))
            }
            const line = stdout.split(/\r?\n/).find(value => value.startsWith('EVALUATION_PM2_REPORT:'))
            if (!line) return reject(new Error('PM2_REPORT_MISSING'))
            resolve(JSON.parse(line.slice('EVALUATION_PM2_REPORT:'.length)))
        })
    })
    let result
    try { result = await run([]) } catch (error) {
        // The same guard and unique pipes confine cleanup to this fixture.
        await run(['--cleanup']).catch(() => {})
        throw error
    }
    const denied = await fs.readFile(path.join(root, 'network-denied.jsonl'), 'utf8').catch(error => {
        if (error.code === 'ENOENT') return ''
        throw error
    })
    if (denied.trim()) throw new Error('PM2_ATTEMPTED_NETWORK')
    const report = {
        node: process.version, pm2: require('pm2/package.json').version, platform: process.platform,
        profile: `%TEMP%/evaluation-pm2-${id}`, exclusiveSockets: true,
        ...result, networkAttempts: 0, databaseAccess: false, smtpDelivery: false,
        completedUtc: new Date().toISOString()
    }
    await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2))
    return report
}

if (require.main === module) main().then(report => console.log(JSON.stringify(report, null, 2))).catch(() => {
    console.error('Validação PM2 isolada falhou; perfil fictício preservado no diretório temporário para diagnóstico local.')
    process.exitCode = 1
})

module.exports = { main }
