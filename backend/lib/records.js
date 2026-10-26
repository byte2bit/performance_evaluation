const { scope } = require('./auth/identity')
const validation = require('./business-validation')

const fields = ['colab', 'avaliacao', 'nivel', 'desconto', 'demandante', 'liderancas',
    'nota_qualidade', 'obs_qualidade', 'nota_prazo', 'obs_prazo', 'nota_dispon', 'obs_dispon',
    'nota_respon', 'obs_respon', 'created_at', 'updated_at', 'itensQualidade', 'itensDispon']
function createRecords(db, { paginated = false } = {}) {
    const getReg = async (req, res) => {
        const paging = paginated ? validation.pagination(req.query) : null
        if (paginated && !paging) return res.status(400).send('Paginação inválida.')
        try {
            const query = scope(db('registros').select('id', ...fields), req.user)
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
            const row = await scope(db('registros').select(...fields), req.user).where({ id: recordId }).first()
            return row ? res.json(row) : res.status(404).send('Registro não encontrado.')
        } catch { return res.status(500).send('Não foi possível carregar o registro.') }
    }
    const saveReg = async (req, res) => {
        const record = validation.evaluation(req.body)
        if (!record) return res.status(400).send('Dados de avaliação inválidos.')
        try {
            const saved = await db.transaction(async trx => {
                const professional = await scope(trx('colab').select('id').where({ colab: record.colab }), req.user)
                    .forShare().first()
                if (!professional) return false
                record.demandante = req.user.email
                await trx('registros').insert(record)
                return true
            })
            return saved ? res.status(204).send() : res.status(403).send('Profissional fora do seu escopo.')
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

module.exports = { createRecords }
