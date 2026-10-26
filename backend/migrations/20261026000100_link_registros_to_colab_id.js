// Additive only: no backfill by name/email and no rewrite of author snapshots.
exports.up = knex => knex.schema.alterTable('registros', table => {
    table.integer('colab_id').unsigned().nullable()
    table.index('colab_id', 'registros_colab_id_index')
    table.foreign('colab_id', 'registros_colab_id_foreign').references('id').inTable('colab')
        .onDelete('RESTRICT').onUpdate('RESTRICT')
})

// A mapping may have been manually reviewed; never erase it during rollback.
exports.down = async () => {
    throw new Error('Preserve os vínculos revisados; a reversão exige plano e backup próprios.')
}
