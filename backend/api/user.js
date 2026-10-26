const { createRecords } = require('../lib/records')
const { scope } = require('../lib/auth/identity')
const validation = require('../lib/business-validation')

module.exports = app => {
    const getColab = async (req, res) => {
        try {
            const rows = await scope(app.db('colab')
                .select('id', 'colab', 'matricula', 'ppu', 'servico', 'funcao', 'liderancas', 'gerencia', 'demandante'), req.user)
                .orderBy('colab')
            return res.json(rows)
        } catch { return res.status(500).send('Não foi possível carregar os profissionais.') }
    }
    const getColabById = async (req, res) => {
        const professionalId = validation.id(req.params.id)
        if (professionalId === null) return res.status(400).send('Identificador inválido.')
        try {
            const row = await scope(app.db('colab')
                .select('id', 'colab', 'matricula', 'ppu', 'servico', 'funcao', 'liderancas', 'gerencia', 'demandante'), req.user)
                .where({ id: professionalId }).first()
            return row ? res.json(row) : res.status(404).send('Profissional não encontrado.')
        } catch { return res.status(500).send('Não foi possível carregar o profissional.') }
    }
    const newColab = async (req, res) => {
        const professional = validation.professional(req.body)
        if (!professional) return res.status(400).send('Dados de profissional inválidos.')
        try {
            await app.db('colab').insert(professional)
            return res.status(204).send()
        } catch { return res.status(500).send('Não foi possível registrar o profissional.') }
    }
    const removeColab = async (req, res) => {
        const professionalId = validation.id(req.params.id)
        if (professionalId === null) return res.status(400).send('Identificador inválido.')
        try {
            await app.db('colab').where({ id: professionalId }).del()
            return res.status(204).send()
        } catch { return res.status(400).send('Não foi possível remover o profissional.') }
    }
    return { ...createRecords(app.db), getColab, getColabById, newColab, removeColab }
}
