const { parentPort, workerData } = require('node:worker_threads')
const { isLegacyHash, validLegacyPassword } = require('./legacy-bcrypt-format')

// One request per worker; no app, environment configuration, SQL or network.
if (parentPort) {
    try {
        if (!isLegacyHash(workerData?.stored) || !validLegacyPassword(workerData?.password)) {
            parentPort.postMessage({ matches: false })
        } else {
            const matches = require('bcrypt-nodejs').compareSync(workerData.password, workerData.stored)
            parentPort.postMessage({ matches })
        }
    } catch {
        parentPort.postMessage({ failed: true })
    } finally {
        workerData.password = undefined
        workerData.stored = undefined
        parentPort.close()
    }
}
