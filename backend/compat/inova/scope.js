// Capability is created only by the guarded, opt-in E1 runner. These migrations
// cannot be picked up by the application's shared migration directory.
const { TARGET, SOURCE, assertScope, CONFIRMATION } = require('../../scripts/local-mysql-copy')
const permits = new WeakSet()
const E1_CONFIRMATION = TARGET + ':3306:compatibility-e1-only'
const fail = code => { throw Object.assign(new Error('Compatibility precondition failed'), { code }) }
const ensure = (value, code) => { if (!value) fail(code) }

function authorize(knex, profile, confirmation) {
    assertScope(profile, CONFIRMATION)
    ensure(confirmation === E1_CONFIRMATION, 'E1_CONFIRMATION_REQUIRED')
    const config = knex.client.config.connection
    ensure(config?.host === '127.0.0.1' && config.port === 3306 && config.database === TARGET, 'E1_TARGET_NOT_APPROVED')
    const permit = Object.freeze({ serverUuid: profile.serverUuid })
    permits.add(permit)
    knex.userParams.inovaE1 = permit
}

async function assertAuthorized(knex) {
    const permit = knex.userParams?.inovaE1
    ensure(permit && permits.has(permit), 'E1_RUNNER_REQUIRED')
    const config = knex.client.config.connection
    ensure(config?.host === '127.0.0.1' && config.port === 3306 && config.database === TARGET && config.database !== SOURCE, 'E1_TARGET_NOT_APPROVED')
    const [[server]] = await knex.raw('SELECT DATABASE() AS name,@@port AS port,@@server_uuid AS uuid,VERSION() AS version')
    ensure(server.name === TARGET && Number(server.port) === 3306 && server.uuid === permit.serverUuid && server.version === '8.0.44', 'E1_SERVER_CHANGED')
}

module.exports = { authorize, assertAuthorized, ensure, TARGET, E1_CONFIRMATION }
