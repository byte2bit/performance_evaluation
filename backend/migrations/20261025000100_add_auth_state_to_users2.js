exports.up = knex => knex.schema.alterTable('users2', table => {
    table.boolean('active').notNullable().defaultTo(false)
    table.integer('session_version').unsigned().notNullable().defaultTo(0)
})

exports.down = knex => knex.schema.alterTable('users2', table => {
    table.dropColumn('session_version')
    table.dropColumn('active')
})
