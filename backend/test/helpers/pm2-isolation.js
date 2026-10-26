const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

function isolatedPaths(profile, id, platform = process.platform) {
    const root = path.resolve(profile)
    if (!/^[a-f0-9]{24}$/.test(id) || path.basename(root) !== `evaluation-pm2-${id}` ||
        path.dirname(root) !== path.resolve(os.tmpdir())) throw new Error('INVALID_PM2_TEST_PROFILE')
    const home = path.join(root, 'home')
    const socket = name => platform === 'win32'
        ? `\\\\.\\pipe\\evaluation-${id}-${name}` : path.join(home, `${name}.sock`)
    return { root, home, rpc: socket('rpc'), pub: socket('pub'), interactor: socket('interactor') }
}

function install() {
    const paths = isolatedPaths(process.env.EVALUATION_PM2_PROFILE, process.env.EVALUATION_PM2_ID)
    const marker = JSON.parse(fs.readFileSync(path.join(paths.root, 'owner.json'), 'utf8'))
    if (marker.id !== process.env.EVALUATION_PM2_ID || process.env.PM2_HOME !== paths.home) {
        throw new Error('PM2_TEST_OWNERSHIP_MISMATCH')
    }
    // Patch only this fixture's module cache. PM2_HOME alone still uses global
    // named pipes on Windows, so no PM2 client may load before this hook.
    const pathsFile = require.resolve('pm2/paths.js')
    const originalPaths = require(pathsFile)
    require.cache[pathsFile].exports = home => {
        const settings = originalPaths(home)
        if (path.resolve(settings.PM2_HOME) !== paths.home) throw new Error('PM2_HOME_ESCAPE')
        return { ...settings, DAEMON_RPC_PORT: paths.rpc, DAEMON_PUB_PORT: paths.pub, INTERACTOR_RPC_PORT: paths.interactor }
    }

    const deniedFile = path.join(paths.root, 'network-denied.jsonl')
    const deny = kind => {
        fs.appendFileSync(deniedFile, JSON.stringify({ kind }) + '\n')
        throw new Error('PM2_TEST_NETWORK_FORBIDDEN')
    }
    const allowed = new Set([paths.rpc, paths.pub, paths.interactor])
    function socketPath(args) {
        const first = Array.isArray(args[0]) ? args[0][0] : args[0]
        return typeof first === 'string' ? first : first?.path
    }
    const net = require('node:net')
    for (const [prototype, method] of [[net.Socket.prototype, 'connect'], [net.Server.prototype, 'listen']]) {
        const original = prototype[method]
        prototype[method] = function (...args) {
            if (!allowed.has(socketPath(args))) return deny(`net.${method}`)
            return original.apply(this, args)
        }
    }
    for (const [module, names] of [
        [require('node:http'), ['request', 'get']], [require('node:https'), ['request', 'get']],
        [require('node:tls'), ['connect']], [require('node:dns'), ['lookup', 'resolve', 'resolve4', 'resolve6']]
    ]) for (const name of names) module[name] = () => deny(name)
    global.fetch = () => deny('fetch')
    return paths
}

if (process.env.EVALUATION_PM2_GUARD === '1') install()

module.exports = { isolatedPaths, install }
