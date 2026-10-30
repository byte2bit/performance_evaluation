const { assertAuthorized, TARGET } = require('../scope')

function changes(knex) {
    return ['users2', 'colab', 'registros'].map(table => knex.raw('ALTER TABLE ??.?? ENGINE=InnoDB', [TARGET, table]))
}
exports.up = async knex => {
    await assertAuthorized(knex)
    for (const change of changes(knex)) await change
}
exports.down = async () => { throw new Error('Preserve a cópia e o backup; reversão exige plano próprio.') }
exports.config = { transaction: false }
exports.changes = changes
