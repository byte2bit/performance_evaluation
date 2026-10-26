const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { isolatedPaths } = require('./pm2-isolation')

async function main() {
    if (process.env.EVALUATION_PM2_GUARD !== '1') throw new Error('GUARD_REQUIRED')
    const paths = isolatedPaths(process.env.EVALUATION_PM2_PROFILE, process.env.EVALUATION_PM2_ID)
    const pm2 = require('pm2')
    const call = async (method, ...args) => {
        await fs.appendFile(path.join(paths.root, 'probe-progress.jsonl'), JSON.stringify({ method, phase: 'begin' }) + '\n')
        const result = await new Promise((resolve, reject) => {
            const deadline = setTimeout(() => reject(new Error(`PM2_${method}_TIMEOUT`)), 8000)
            pm2[method](...args, (error, result) => {
                clearTimeout(deadline)
                error ? reject(new Error(`PM2_${method}_FAILED`)) : resolve(result)
            })
        })
        await fs.appendFile(path.join(paths.root, 'probe-progress.jsonl'), JSON.stringify({ method, phase: 'end' }) + '\n')
        return result
    }
    assert.equal(pm2.Client.rpc_socket_file, paths.rpc)
    assert.equal(pm2.Client.pub_socket_file, paths.pub)
    const checks = []
    let connected = false
    let daemonPid
    try {
        await call('connect')
        connected = true
        daemonPid = Number(await fs.readFile(path.join(paths.home, 'pm2.pid'), 'utf8'))
        assert.deepEqual(await call('list'), [])
        checks.push('empty-exclusive-daemon')
        if (process.argv.includes('--cleanup')) return

        const name = 'evaluation-pm2-fixture'
        await call('start', {
            name, script: path.join(paths.root, 'fixture.cjs'), cwd: paths.root,
            exec_mode: 'fork', instances: 1, autorestart: false,
            wait_ready: true, listen_timeout: 5000, pmx: false,
            env: { SYNTHETIC_PM2_VALUE: 'fixture-preserved' }
        })
        const first = (await call('list'))[0]
        assert.equal(first.pm2_env.status, 'online')
        assert.equal(first.pm2_env.name, name)
        assert.equal(path.resolve(first.pm2_env.pm_exec_path), path.join(paths.root, 'fixture.cjs'))
        assert.equal(path.resolve(first.pm2_env.pm_cwd), paths.root)
        const readState = () => fs.readFile(path.join(paths.root, 'fixture-state.json'), 'utf8').then(JSON.parse)
        const state = await readState()
        assert.equal(state.value, 'fixture-preserved')
        assert.equal(state.hasSessionSecret, false)
        assert.equal(state.hasSmtpPassword, false)
        checks.push('start-and-sanitized-environment')

        await call('restart', name)
        const restarted = (await call('list'))[0]
        assert.equal(restarted.pm2_env.status, 'online')
        assert.notEqual(restarted.pid, first.pid)
        assert.equal((await readState()).value, 'fixture-preserved')
        assert.equal((await readState()).pid, restarted.pid)
        checks.push('restart-preserves-environment')

        const log = path.resolve(restarted.pm2_env.pm_out_log_path)
        assert.ok(log.startsWith(path.join(paths.home, 'logs') + path.sep))
        assert.match(await fs.readFile(log, 'utf8'), /SYNTHETIC_PM2_READY/)
        checks.push('logs-confined-to-profile')

        await call('stop', name)
        assert.equal((await call('list'))[0].pm2_env.status, 'stopped')
        checks.push('stop')
        await call('delete', name)
        assert.deepEqual(await call('list'), [])
        checks.push('delete-only-fixture')
    } finally {
        if (connected) await call('killDaemon')
        pm2.disconnect()
    }
    for (let attempt = 0; attempt < 50; attempt++) {
        try { process.kill(daemonPid, 0) } catch (error) {
            if (error.code !== 'ESRCH') throw error
            checks.push('exclusive-daemon-terminated')
            return { checks, passed: checks.length, daemonTerminated: true }
        }
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    throw new Error('PM2_TEST_DAEMON_STILL_RUNNING')
}

main().then(report => {
    console.log('EVALUATION_PM2_REPORT:' + JSON.stringify(report || { cleanup: true }))
    process.exit(0)
}).catch(error => {
    console.error('PM2_ISOLATED_PROBE_FAILED: ' + error.message.replace(/C:\\Users\\[^\\\s]+/gi, '<user>'))
    process.exit(1)
})
