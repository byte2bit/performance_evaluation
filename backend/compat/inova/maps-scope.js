const { TARGET, CONFIRMATION, assertScope } = require('../../scripts/local-mysql-copy')
const { ensure } = require('../../scripts/local-access-guard')
const E3_CONFIRMATION = TARGET + ':3306:maps-e3-owner12-exact395-preview'
const permits = new WeakSet()

function authorize(knex, profile, confirmation) {
    assertScope(profile, CONFIRMATION)
    const connection = knex.client.config.connection
    ensure(confirmation === E3_CONFIRMATION && connection.host === '127.0.0.1' && connection.port === 3306 && connection.database === TARGET, 'E3_SCOPE_REFUSED')
    const permit = Object.freeze({ uuid: profile.serverUuid })
    permits.add(permit); knex.userParams.inovaMapsE3 = permit
}
async function assertAuthorized(knex) {
    const permit = knex.userParams?.inovaMapsE3, connection = knex.client.config.connection
    ensure(permit && permits.has(permit) && connection?.host === '127.0.0.1' && connection.port === 3306 && connection.database === TARGET, 'E3_RUNNER_REQUIRED')
    const [[row]] = await knex.raw('SELECT DATABASE() AS name,@@port AS port,@@server_uuid AS uuid,VERSION() AS version')
    ensure(row.name === TARGET && Number(row.port) === 3306 && row.uuid === permit.uuid && row.version === '8.0.44', 'E3_SERVER_CHANGED')
}
module.exports = { authorize, assertAuthorized, E3_CONFIRMATION }
