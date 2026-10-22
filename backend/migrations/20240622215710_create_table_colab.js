/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('colab', table => {
        table.increments('id').primary()
        table.string('colab').notNull()
        table.string('ppu')
        table.string('servico')
        table.string('funcao')
        table.string('liderancas')
        table.string('gerencia')
        table.string('demandante').notNull()

    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('colab')
};
