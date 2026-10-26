exports.up = knex => knex.schema.createTable('sessions', table => {
    table.string('sid', 255).primary()
    table.json('sess').notNullable()
    table.dateTime('expired').notNullable().index()
})

exports.down = knex => knex.schema.dropTable('sessions')
