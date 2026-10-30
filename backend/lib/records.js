const { scope, isAdmin, active, normalizeEmail } = require('./auth/identity')
const validation = require('./business-validation')

const fields = ['colab', 'colab_id', 'avaliacao', 'nivel', 'desconto', 'demandante', 'liderancas',
    'nota_qualidade', 'obs_qualidade', 'nota_prazo', 'obs_prazo', 'nota_dispon', 'obs_dispon',
    'nota_respon', 'obs_respon', 'created_at', 'updated_at', 'itensQualidade', 'itensDispon']
function scopeRecords(db, query, user) {
    if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 })
    // Author snapshots never grant access. NULL/unreconciled links are admin-only.
    return isAdmin(user) ? query : query.whereIn('colab_id', scope(db('colab').select('id'), user, db))
}

// Use the database's calendar and capture the time after acquiring the
// professional lock. The very same value is persisted, even at month rollover.
const recordingClockSql = "SELECT DATE_FORMAT(CURRENT_TIMESTAMP, '%Y-%m-%d %H:%i:%s') AS recorded_at"
function monthBounds(timestamp) {
    if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) throw new Error('Invalid database clock')
    const year = Number(timestamp.slice(0, 4)), month = Number(timestamp.slice(5, 7))
    if (month < 1 || month > 12) throw new Error('Invalid database month')
    return { start: timestamp.slice(0, 7) + '-01 00:00:00',
        end: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01 00:00:00` }
}
function monthlyRecordQuery(trx, professionalId, timestamp) {
    const { start, end } = monthBounds(timestamp)
    return trx('registros').select('id').where({ colab_id: professionalId })
        .where('created_at', '>=', start).where('created_at', '<', end).first()
}

function createRecords(db, { paginated = false } = {}) {
    const getReg = async (req, res) => {
        const paging = paginated ? validation.pagination(req.query) : null
        if (paginated && !paging) return res.status(400).send('Paginação inválida.')
        try {
            const query = scopeRecords(db, db('registros').select('id', ...fields), req.user)
                .orderBy('created_at', 'desc').orderBy('id', 'desc')
            if (paginated) {
                query.limit(paging.limit).offset(paging.offset)
            }
            return res.json(await query)
        } catch { return res.status(500).send('Não foi possível carregar os registros.') }
    }
    const getRegById = async (req, res) => {
        const recordId = validation.id(req.params.id)
        if (recordId === null) return res.status(400).send('Identificador inválido.')
        try {
            const row = await scopeRecords(db, db('registros').select(...fields), req.user).where({ id: recordId }).first()
            return row ? res.json(row) : res.status(404).send('Registro não encontrado.')
        } catch { return res.status(500).send('Não foi possível carregar o registro.') }
    }
    const saveReg = async (req, res) => {
        const record = validation.evaluation(req.body)
        if (!record) return res.status(400).send('Dados de avaliação inválidos.')
        try {
            // After waiting for the professional lock, read the preceding commit
            // rather than reusing an earlier REPEATABLE READ snapshot.
            const saved = await db.transaction(async trx => {
                const actor = await trx('users2').where({ id: req.user.id }).forShare().first()
                if (!active(actor) || actor.session_version !== req.user.session_version) return 403
                const byId = Object.hasOwn(record, 'colab_id')
                const candidates = await scope(trx('colab').select('id', 'colab', 'gerencia_id')
                    .whereNull('deletedAt').where(byId ? { id: record.colab_id } : { colab: record.colab }), actor, trx).limit(2)
                if (!candidates.length) return 403
                if (candidates.length !== 1) return 409
                const selected = candidates[0]
                const department = await trx('gerencias').where({ id: selected.gerencia_id }).whereNull('deletedAt').forShare().first()
                if (!department || (!isAdmin(actor) && department.demandante_id !== actor.id)) return 403
                const professional = await trx('colab').select('id', 'colab', 'gerencia_id', 'deletedAt').where({ id: selected.id }).forUpdate().first()
                if (!professional || professional.deletedAt != null || professional.gerencia_id !== department.id) return 403
                if (byId && professional.colab !== record.colab) return 409
                record.colab_id = professional.id
                record.colab = professional.colab
                record.demandante = normalizeEmail(actor.email)
                const [[clock]] = await trx.raw(recordingClockSql)
                if (await monthlyRecordQuery(trx, professional.id, clock.recorded_at)) return 'duplicate-month'
                record.created_at = clock.recorded_at
                await trx('registros').insert(record)
                return 204
            }, { isolationLevel: 'read committed' })
            if (saved === 403) return res.status(403).send('Profissional fora do seu escopo.')
            if (saved === 409) return res.status(409).send('Seleção de profissional ambígua ou desatualizada.')
            if (saved === 'duplicate-month') return res.status(409).send('Este profissional já possui uma avaliação neste mês.')
            return res.status(204).send()
        } catch { return res.status(500).send('Não foi possível salvar o registro.') }
    }
    const removeReg = async (req, res) => {
        const recordId = validation.id(req.params.id)
        if (recordId === null) return res.status(400).send('Identificador inválido.')
        try {
            await db('registros').where({ id: recordId }).del()
            return res.status(204).send()
        } catch { return res.status(400).send('Não foi possível remover o registro.') }
    }
    return { getReg, getRegById, saveReg, removeReg }
}

module.exports = { createRecords, scopeRecords, monthBounds, monthlyRecordQuery, recordingClockSql }
