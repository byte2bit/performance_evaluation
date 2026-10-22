// Update with your config settings.

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
const {db} = require('./.env')

module.exports = {
  client: 'mysql',
    connection: db,
    migrations: {
      tableName: 'migrations'
    }
};

