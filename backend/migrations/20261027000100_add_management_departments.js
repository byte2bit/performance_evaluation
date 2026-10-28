// Existing textual values are preserved for reviewed reconciliation, never inferred.
function changes(knex) {
    return [
        knex.schema.createTable('gerencias', table => {
            table.increments('id').primary()
            table.string('nome').notNullable()
            table.integer('demandante_id').unsigned().notNullable()
            table.foreign('demandante_id').references('id').inTable('users2').onDelete('RESTRICT').onUpdate('RESTRICT')
            table.timestamp('deletedAt').nullable()
            table.timestamps(true, true)
        }),
        knex.schema.alterTable('colab', table => {
            table.integer('gerencia_id').unsigned().nullable()
            table.timestamp('deletedAt').nullable()
            table.index(['gerencia_id', 'deletedAt'], 'colab_gerencia_active_index')
            table.foreign('gerencia_id').references('id').inTable('gerencias').onDelete('RESTRICT').onUpdate('RESTRICT')
        }),
        knex.schema.alterTable('registros', table => table.dropForeign('colab'))
    ]
}

exports.up = async knex => {
    const [row] = await knex('registros').whereNull('colab_id').count('* as total')
    if (Number(row.total) !== 0) throw new Error('Concilie os vínculos das avaliações antes de remover a referência textual.')
    for (const change of changes(knex)) await change
}
exports.down = async () => { throw new Error('Preserve gerências, arquivamentos e vínculos; reversão exige plano e backup próprios.') }
exports.changes = changes
