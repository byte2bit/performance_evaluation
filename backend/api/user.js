const { createRecords } = require('../lib/records')
const { scope } = require('../lib/auth/identity')
const validation = require('../lib/business-validation')
const { createManagement, decorate } = require('../lib/management')

module.exports = app => {
    const management = createManagement(app.db)
    const getColab = async (req, res) => {
        try {
            let query = app.db('colab').select('id', 'colab', 'matricula', 'ppu', 'servico', 'funcao', 'liderancas', 'gerencia', 'gerencia_id', 'deletedAt')
            if (!req.user.admin || req.query.estado !== 'todos') query = query.whereNull('deletedAt')
            const rows = await scope(query, req.user, app.db)
                .orderBy('colab')
            return res.json(await decorate(app.db, rows))
        } catch { return res.status(500).send('Não foi possível carregar os profissionais.') }
    }
    const getColabById = async (req, res) => {
        const professionalId = validation.id(req.params.id)
        if (professionalId === null) return res.status(400).send('Identificador inválido.')
        try {
            const row = await scope(app.db('colab')
                .select('id', 'colab', 'matricula', 'ppu', 'servico', 'funcao', 'liderancas', 'gerencia', 'gerencia_id', 'deletedAt')
                .whereNull('deletedAt'), req.user, app.db)
                .where({ id: professionalId }).first()
            return row ? res.json((await decorate(app.db, [row]))[0]) : res.status(404).send('Profissional não encontrado.')
        } catch { return res.status(500).send('Não foi possível carregar o profissional.') }
    }
    return { ...createRecords(app.db), getColab, getColabById,
        newColab: management.saveProfessional, updateColab: management.saveProfessional, removeColab: management.removeProfessional }
}
