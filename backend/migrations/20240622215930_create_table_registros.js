/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('registros', table => {
        table.increments('id').primary()
        table.string('colab').notNull()
        table.foreign('colab').references('colab.colab')
        table.string('avaliacao').notNull()
        table.string('nivel').notNull()
        table.string('desconto').notNull()
        table.string('demandante').notNull()

        table.string('nota_qualidade').notNull()
        table.string('obs_qualidade').notNull()
        table.string('nota_prazo').notNull()
        table.string('obs_prazo').notNull()
        table.string('nota_dispon').notNull()
        table.string('obs_dispon').notNull()
        table.string('nota_respon').notNull()
        table.string('obs_respon').notNull()

        // table.integer('colabId').unsigned().references('colab.id').notNull()

        table.timestamps(true, true)
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('registros')
};
