exports.up = knex => knex.schema.createTable('auth_rate_limits', table => {
    table.string('key', 255).primary()
    table.integer('points').notNullable().defaultTo(0)
    table.bigInteger('expire').unsigned().index()
})

exports.down = knex => knex.schema.dropTable('auth_rate_limits')
