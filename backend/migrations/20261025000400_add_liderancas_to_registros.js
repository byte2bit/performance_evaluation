exports.up = async knex => {
    if (!await knex.schema.hasColumn('registros', 'liderancas')) {
        await knex.schema.alterTable('registros', table => table.string('liderancas'))
    }
}

// Keep existing/manual values intact; removal requires its own reviewed migration.
exports.down = async () => { throw new Error('A coluna pode conter dados preexistentes; sua remoção exige migration e backup próprios.') }
