// No backfill: every professional, including archived ones, must already be linked.
exports.up = async knex => {
    const row = await knex('colab as c')
        .leftJoin('gerencias as g', 'g.id', 'c.gerencia_id')
        .leftJoin('users2 as u', 'u.id', 'g.demandante_id')
        .where(function () { this.whereNull('c.gerencia_id').orWhereNull('g.id').orWhereNull('u.id') })
        .count('* as total').first()
    if (!row || Number(row.total) !== 0) {
        throw Object.assign(new Error('Revise os vínculos de todos os profissionais antes de exigir gerência.'),
            { code: 'PROFESSIONAL_DEPARTMENT_LINKS_REQUIRED' })
    }
    await knex.schema.alterTable('colab', table => table.integer('gerencia_id').unsigned().notNullable().alter())
}

exports.down = async () => { throw new Error('Preserve o vínculo obrigatório; reversão exige plano e backup próprios.') }
// MySQL DDL commits implicitly; do not suggest transactional rollback protection.
exports.config = { transaction: false }
