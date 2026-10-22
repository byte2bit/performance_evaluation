/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
    return knex.schema.alterTable('registros', function (table) {
        table.string('itensQualidade')
        table.string('itensDispon')
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
    return knex.schema.alterTable('registros', function (table) {
        table.dropColumn('itensQualidade')
        table.dropColumn('itensDispon')
    })
};
