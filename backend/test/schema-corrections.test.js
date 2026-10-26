const assert = require('node:assert/strict')
const test = require('node:test')
const index = require('../migrations/20240622215800_add_colab_name_index')
const leaders = require('../migrations/20261025000400_add_liderancas_to_registros')

test('schema corrections preserve an existing compatible name index and existing leadership column', async () => {
    const db = () => {
        const query = { select() { return this }, whereRaw() { return this }, where() { return this },
            whereNull() { return this }, async first() { return { INDEX_NAME: 'preexisting_manual_index' } } }
        return query
    }
    db.schema = { async hasColumn() { return true }, alterTable() { assert.fail('Existing schema must not be rewritten') } }
    await index.up(db)
    await leaders.up(db)
})

test('corrective migrations never silently remove preexisting data or a referenced index on rollback', async () => {
    await assert.rejects(index.down(), /reversão/)
    await assert.rejects(leaders.down(), /preexistentes/)
})
