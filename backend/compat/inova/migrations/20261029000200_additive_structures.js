const { assertAuthorized, TARGET } = require('../scope')

function changes(knex) {
    return [
        knex.schema.withSchema(TARGET).alterTable('users2', table => {
            table.boolean('active').notNullable().defaultTo(false)
            table.integer('session_version').unsigned().notNullable().defaultTo(0)
        }),
        knex.schema.withSchema(TARGET).createTable('sessions', table => {
            table.engine('InnoDB')
            table.string('sid', 255).primary()
            table.json('sess').notNullable()
            table.dateTime('expired').notNullable().index()
        }),
        knex.schema.withSchema(TARGET).createTable('auth_rate_limits', table => {
            table.engine('InnoDB')
            table.string('key', 255).primary()
            table.integer('points').notNullable().defaultTo(0)
            table.bigInteger('expire').unsigned().index()
        }),
        knex.schema.withSchema(TARGET).createTable('gerencias', table => {
            table.engine('InnoDB')
            table.increments('id').primary()
            table.string('nome').notNullable()
            table.integer('demandante_id').unsigned().notNullable()
            table.foreign('demandante_id', 'gerencias_demandante_id_foreign').references('id').inTable(TARGET + '.users2')
                .onDelete('RESTRICT').onUpdate('RESTRICT')
            table.timestamp('deletedAt').nullable()
            table.timestamps(true, true)
        }),
        knex.schema.withSchema(TARGET).alterTable('colab', table => {
            table.integer('gerencia_id').unsigned().nullable()
            table.timestamp('deletedAt').nullable()
            table.index(['gerencia_id', 'deletedAt'], 'colab_gerencia_active_index')
            table.foreign('gerencia_id', 'colab_gerencia_id_foreign').references('id').inTable(TARGET + '.gerencias')
                .onDelete('RESTRICT').onUpdate('RESTRICT')
        }),
        knex.schema.withSchema(TARGET).alterTable('registros', table => {
            table.integer('colab_id').unsigned().nullable()
            table.index('colab_id', 'registros_colab_id_index')
            table.foreign('colab_id', 'registros_colab_id_foreign').references('id').inTable(TARGET + '.colab')
                .onDelete('RESTRICT').onUpdate('RESTRICT')
        })
    ]
}
exports.up = async knex => {
    await assertAuthorized(knex)
    for (const change of changes(knex)) await change
}
exports.down = async () => { throw new Error('Preserve contas e histórico; reversão exige plano próprio.') }
exports.config = { transaction: false }
exports.changes = changes
