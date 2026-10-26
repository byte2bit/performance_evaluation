const { scope, isAdmin } = require('./auth/identity')
const validation = require('./business-validation')

const fields = ['colab', 'colab_id', 'avaliacao', 'nivel', 'desconto', 'demandante', 'liderancas',
    'nota_qualidade', 'obs_qualidade', 'nota_prazo', 'obs_prazo', 'nota_dispon', 'obs_dispon',
    'nota_respon', 'obs_respon', 'created_at', 'updated_at', 'itensQualidade', 'itensDispon']
function scopeRecords(db, query, user) {
    if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 })
    // Author snapshots never grant access. NULL/unreconciled links are admin-only.
    return isAdmin(user) ? query : query.whereIn('colab_id', scope(db('colab').select('id'), user))
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
            const saved = await db.transaction(async trx => {
                const byId = Object.hasOwn(record, 'colab_id')
                const candidates = await scope(trx('colab').select('id', 'colab')
                    .where(byId ? { id: record.colab_id } : { colab: record.colab }), req.user)
                    .forShare().limit(2)
                if (!candidates.length) return 403
                if (candidates.length !== 1) return 409
                const professional = candidates[0]
                if (byId && professional.colab !== record.colab) return 409
                record.colab_id = professional.id
                record.colab = professional.colab
                record.demandante = req.user.email
                await trx('registros').insert(record)
                return 204
            })
            if (saved === 403) return res.status(403).send('Profissional fora do seu escopo.')
            if (saved === 409) return res.status(409).send('Seleção de profissional ambígua ou desatualizada.')
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

module.exports = { createRecords, scopeRecords }
