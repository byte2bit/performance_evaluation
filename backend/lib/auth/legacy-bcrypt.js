const path = require('node:path')
const { Worker } = require('node:worker_threads')
const { isLegacyHash, validLegacyPassword } = require('./legacy-bcrypt-format')

const unavailable = () => Object.assign(new Error('Serviço indisponível.'), { code: 'LEGACY_BCRYPT_UNAVAILABLE' })

function createLegacyBcrypt({ maxWorkers = 1, maxQueue = 4, timeoutMs = 5000, WorkerClass = Worker } = {}) {
    if (!Number.isInteger(maxWorkers) || maxWorkers < 1 || maxWorkers > 2 ||
        !Number.isInteger(maxQueue) || maxQueue < 0 || maxQueue > 8 ||
        !Number.isInteger(timeoutMs) || timeoutMs < 25 || timeoutMs > 10000) throw unavailable()
    const queue = [], active = new Set(), finishing = new Set()
    let closed = false, closePromise

    function finish(job, error, matches) {
        if (job.done) return
        job.done = true
        clearTimeout(job.timer)
        const index = queue.indexOf(job)
        if (index !== -1) queue.splice(index, 1)
        job.stored = undefined; job.password = undefined
        // Keep the slot until the worker has really stopped, including on
        // timeout. A message alone must not allow more simultaneous workers.
        const stopping = Promise.resolve().then(() => job.worker?.terminate())
        const pending = stopping.then(() => {
            if (error) job.reject(error)
            else job.resolve(matches)
        }, () => {
            closed = true
            job.reject(unavailable())
            for (const waiting of [...queue, ...active]) finish(waiting, unavailable())
        }).finally(() => {
            active.delete(job)
            finishing.delete(pending)
            drain()
        })
        finishing.add(pending)
    }

    function drain() {
        while (!closed && active.size < maxWorkers && queue.length) {
            const job = queue.shift()
            active.add(job)
            try {
                job.worker = new WorkerClass(path.join(__dirname, 'legacy-bcrypt-worker.js'), {
                    workerData: { stored: job.stored, password: job.password },
                    env: {}, execArgv: [], stdout: true, stderr: true,
                    resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 4, stackSizeMb: 2 }
                })
                job.stored = undefined; job.password = undefined
                // Worker diagnostics are never forwarded: they may originate
                // in a library or contain a sensitive error in future changes.
                job.worker.stdout?.resume(); job.worker.stderr?.resume()
                job.worker.once('message', result => {
                    if (!result || Object.keys(result).length !== 1 || typeof result.matches !== 'boolean') finish(job, unavailable())
                    else finish(job, null, result.matches)
                })
                job.worker.once('error', () => finish(job, unavailable()))
                job.worker.once('exit', () => finish(job, unavailable()))
            } catch { finish(job, unavailable()) }
        }
    }

    function verify(stored, password) {
        if (closed) return Promise.reject(unavailable())
        if (!isLegacyHash(stored) || !validLegacyPassword(password)) return Promise.resolve(false)
        if (active.size >= maxWorkers && queue.length >= maxQueue) return Promise.reject(unavailable())
        return new Promise((resolve, reject) => {
            const job = { stored, password, resolve, reject, done: false }
            // Deadline includes time waiting in the bounded queue.
            job.timer = setTimeout(() => finish(job, unavailable()), timeoutMs)
            queue.push(job)
            drain()
        })
    }

    function close() {
        if (!closePromise) {
            closed = true
            for (const job of [...queue, ...active]) finish(job, unavailable())
            closePromise = Promise.all([...finishing]).then(() => undefined)
        }
        return closePromise
    }
    return { verify, close }
}

module.exports = { createLegacyBcrypt }
