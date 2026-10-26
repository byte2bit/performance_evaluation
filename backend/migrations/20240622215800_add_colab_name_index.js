exports.up = async knex => {
    const existing = await knex('information_schema.STATISTICS').select('INDEX_NAME')
        .whereRaw('TABLE_SCHEMA = DATABASE()')
        .where({ TABLE_NAME: 'colab', COLUMN_NAME: 'colab', SEQ_IN_INDEX: 1 })
        .whereNull('SUB_PART').first()
    if (!existing) await knex.schema.alterTable('colab', table => table.index('colab', 'colab_name_index'))
}

// The index supports an existing FK and may predate this migration on manually
// maintained databases. An automatic rollback must not remove it.
exports.down = async () => { throw new Error('Planeje a reversão do índice junto da chave estrangeira; não há remoção automática.') }
