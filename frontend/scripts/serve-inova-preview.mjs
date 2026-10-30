import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let server
try {
    const directory = fs.realpathSync(process.argv[2])
    const expected = path.resolve(process.env.LOCALAPPDATA || '', 'EvaluationDev/inova-nucleo-compat-20261029')
    const nonce = process.env.EVAL_INOVA_PREVIEW_NONCE
    if (directory.toLowerCase() !== expected.toLowerCase() || !/^[a-f0-9]{32}$/.test(nonce || '') || process.env.VITE_API_URL !== 'http://localhost:8002') throw new Error('Preview scope refused')
    const log = code => fs.appendFileSync(path.join(directory, 'inova-preview-frontend.events.jsonl'), JSON.stringify({ code, utc: new Date().toISOString() }) + '\n')
    const logger = { hasWarned: false, info() {}, warn() { log('VITE_WARNING') }, warnOnce() { log('VITE_WARNING') },
        error() { log('VITE_ERROR') }, clearScreen() {}, hasErrorLogged() { return false } }
    server = await createServer({ root, configFile: path.join(root, 'vite.config.js'), cacheDir: path.join(root, 'node_modules/.cache/inova-preview-vite'),
        customLogger: logger, server: { host: '127.0.0.1', port: 5174, strictPort: true },
        plugins: [{ name: 'inova-preview-status', configureServer(vite) {
            vite.middlewares.use('/__inova_preview', (req, res) => {
                res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ preview: 'inova-local-e3', nonce, pid: process.pid }))
            })
        } }] })
    await server.listen(); log('PREVIEW_READY')
    const close = () => server.close().then(() => process.exit(0))
    process.once('SIGINT', close); process.once('SIGTERM', close)
} catch {
    if (server) await server.close()
    process.stderr.write(JSON.stringify({ success: false, code: 'FRONTEND_PREVIEW_FAILED', privateDiagnosticsSuppressed: true }) + '\n')
    process.exitCode = 1
}
