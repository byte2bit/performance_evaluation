const { TARGET } = require('../../../scripts/local-mysql-copy')
const { ensure } = require('../../../scripts/local-access-guard')
const { assertAuthorized } = require('../maps-scope')
const change = knex => knex.schema.withSchema(TARGET).alterTable('colab', table => table.integer('gerencia_id').unsigned().notNullable().alter())

exports.up = async knex => {
    await assertAuthorized(knex)
    const row = await knex(TARGET + '.colab as c')
        .leftJoin(TARGET + '.gerencias as g', 'g.id', 'c.gerencia_id')
        .leftJoin(TARGET + '.users2 as u', 'u.id', 'g.demandante_id')
        .where(function () { this.whereNull('c.gerencia_id').orWhereNull('g.id').orWhereNull('u.id').orWhere('u.active', '<>', 1).orWhereNotNull('u.deletedAt') })
        .count('* as total').first()
    ensure(row && Number(row.total) === 0, 'E3_DEPARTMENT_LINKS_REQUIRED')
    await change(knex)
}
exports.down = async () => { throw new Error('Preserve mapas e gerência obrigatória; reversão exige plano próprio.') }
exports.config = { transaction: false }
exports.change = change
