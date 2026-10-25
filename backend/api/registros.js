const bcrypt = require('bcrypt-nodejs')

module.exports = app => {
/*     const { existsOrError, notExistsOrError, equalsOrError } = app.api.validation

    const encryptPassword = password => {
        const salt = bcrypt.genSaltSync(10)
        return bcrypt.hashSync(password, salt)
    } */

/** TABELA REGISTROS ************************/

    const getReg = async (req, res) => {
        const page = parseInt(req.query.page) || 1
        const limit = req.query.limit
        const offset = (page - 1) * limit

        try {
            const registros = await app.db("registros")
                .select("id","colab", "avaliacao", "nivel", "desconto", "demandante", "liderancas", "nota_qualidade", "obs_qualidade", "nota_prazo", "obs_prazo", "nota_dispon", "obs_dispon", "nota_respon", "obs_respon", "created_at", "updated_at", "itensQualidade", "itensDispon")
                .orderBy("created_at", "desc")
                .limit(limit)
                .offset(offset)

            return res.json(registros)
        } catch {
            return res.status(500).send('Não foi possível carregar os registros.')
        }
    }
   
 /*    const getReg = (req, res) => {
        app.db("registros")
            .select("id", "colab", "avaliacao", "nivel", "desconto", "demandante", "liderancas", "nota_qualidade", "obs_qualidade", "nota_prazo", "obs_prazo", "nota_dispon", "obs_dispon", "nota_respon", "obs_respon", "created_at", "updated_at", "itensQualidade", "itensDispon")
            .orderBy("created_at", "desc")
            .then(registros => res.json(registros))
            .catch(err => res.status(500).send(err))
        } */

    const saveReg = (req, res) => { //async 
        const user = { ...req.body }
        app.db('registros')
            .insert(user)
            .then(_ => res.status(204).send())
            .catch(err => res.status(500).send(err))
        // }
    }

    const getRegById = (req, res) => {
        app.db('registros')
            .select("colab", "avaliacao", "nivel", "desconto", "demandante", "liderancas", "nota_qualidade", "obs_qualidade", "nota_prazo", "obs_prazo", "nota_dispon", "obs_dispon", "nota_respon", "obs_respon", "created_at", "updated_at", "itensQualidade", "itensDispon")
            .where({ id: req.params.id })
            // .whereNull('deletedAt')
            .first()
            .then(colabs => res.json(colabs))
            .catch(err => res.status(500).send(err))
    }

    const removeReg = async (req, res) => {
        try {
            const rowsUpdate = await app.db('registros')
                // .update({ deletedAt: new Date() })
                .where({ id: req.params.id })
                .del()
            // existsOrError(rowsUpdate, 'Usuário não foi encontrado.')

            res.status(204).send()
        } catch (msg) {
            res.status(400).send(msg)
        }
    }



    return { saveReg, getReg, getRegById, removeReg }
}
