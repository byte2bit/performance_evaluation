const { active, isAdmin, normalizeEmail } = require('./auth/identity')
const { validPassword, createPasswords } = require('./auth/passwords')
const validation = require('./business-validation')

const fail = (status, message) => { throw Object.assign(new Error(message), { status, publicMessage: message }) }
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const name = value => typeof value === 'string' && value.trim() && [...value.trim()].length <= 255
const fields = ['id', 'name', 'email', 'admin', 'active', 'deletedAt']

async function lockAdmin(trx, actor) {
    const admins = await trx('users2').where({ admin: true, active: true }).whereNull('deletedAt').orderBy('id').forUpdate().select('id')
    const current = await trx('users2').where({ id: actor.id }).forUpdate().first()
    if (!active(current) || !isAdmin(current) || current.session_version !== actor.session_version) fail(403, 'Acesso não permitido.')
    return admins
}

async function decorate(db, rows) {
    if (!rows.length) return []
    const departments = await db('gerencias').select('id', 'nome', 'demandante_id').whereIn('id', [...new Set(rows.map(row => row.gerencia_id).filter(Boolean))])
    const users = await db('users2').select('id', 'name', 'email').whereIn('id', [...new Set(departments.map(row => row.demandante_id))])
    return rows.map(row => {
        const department = departments.find(item => item.id === row.gerencia_id)
        const user = users.find(item => item.id === department?.demandante_id)
        return { ...row, gerencia: department?.nome || row.gerencia || null,
            demandante: user ? normalizeEmail(user.email) : null, demandante_nome: user?.name || null }
    })
}

function createManagement(db, passwords = createPasswords()) {
    const guarded = handler => async (req, res) => {
        try { return await handler(req, res) }
        catch (error) {
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).send('E-mail já cadastrado.')
            return res.status(error.status || 500).send(error.publicMessage || 'Não foi possível concluir a operação.')
        }
    }
    const routeId = req => {
        const id = validation.id(req.params.id)
        if (id === null) fail(400, 'Identificador inválido.')
        return id
    }
    const accountData = (body, creating) => {
        const allowed = creating ? ['name', 'email', 'password'] : ['name', 'email']
        if (!object(body) || Object.keys(body).some(key => !allowed.includes(key)) || !name(body.name) ||
            !normalizeEmail(body.email) || (creating && !validPassword(body.password))) fail(400, 'Informe nome, e-mail e senha válidos.')
        return { name: body.name.trim(), email: normalizeEmail(body.email) }
    }
    const getDemandantes = guarded(async (req, res) => {
        const rows = await db('users2').select(...fields).whereNull('deletedAt').orderBy('name').orderBy('id')
        return res.json(rows)
    })
    const createDemandante = guarded(async (req, res) => {
        const data = accountData(req.body, true)
        const hash = await passwords.hash(req.body.password)
        await db.transaction(async trx => {
            await lockAdmin(trx, req.user)
            await trx('users2').insert({ ...data, password: hash, admin: false, active: true, session_version: 0 })
        })
        return res.status(204).send()
    })
    const updateDemandante = guarded(async (req, res) => {
        const id = routeId(req), data = accountData(req.body, false)
        await db.transaction(async trx => {
            await lockAdmin(trx, req.user)
            const user = await trx('users2').where({ id }).forUpdate().first()
            if (!user || user.deletedAt != null) fail(404, 'Conta não encontrada.')
            await trx('users2').where({ id }).update({ ...data, session_version: trx.raw('session_version + 1') })
        })
        return res.status(204).send()
    })
    const removeDemandante = guarded(async (req, res) => {
        const id = routeId(req)
        await db.transaction(async trx => {
            const admins = await lockAdmin(trx, req.user)
            const user = await trx('users2').where({ id }).forUpdate().first()
            if (!user || user.deletedAt != null) fail(404, 'Conta não encontrada.')
            if (id === req.user.id || (active(user) && isAdmin(user) && admins.length <= 1)) fail(409, 'Preserve sua conta e pelo menos um administrador ativo.')
            if (await trx('gerencias').where({ demandante_id: id }).forUpdate().first()) fail(409, 'Reatribua as gerências antes de excluir o demandante.')
            await trx('users2').where({ id }).update({ active: false, deletedAt: new Date(), session_version: trx.raw('session_version + 1') })
        })
        return res.status(204).send()
    })
    const getGerencias = guarded(async (req, res) => {
        let query = db('gerencias').select('id', 'nome', 'demandante_id', 'deletedAt')
        if (!isAdmin(req.user)) query = query.where({ demandante_id: req.user.id }).whereNull('deletedAt')
        else if (req.query.estado !== 'todos') query = query.whereNull('deletedAt')
        const rows = await query.orderBy('nome').orderBy('id')
        const users = await db('users2').select(...fields).whereIn('id', [...new Set(rows.map(row => row.demandante_id))])
        return res.json(rows.map(row => {
            const user = users.find(item => item.id === row.demandante_id)
            return { ...row, demandante_nome: user?.name || null, demandante: user ? normalizeEmail(user.email) : null,
                demandante_disponivel: active(user) }
        }))
    })
    const saveGerencia = guarded(async (req, res) => {
        const id = req.params.id === undefined ? null : routeId(req), body = req.body
        if (!object(body) || !name(body.nome) || validation.id(body.demandante_id) === null ||
            Object.keys(body).some(key => !['nome', 'demandante_id'].includes(key))) fail(400, 'Informe a gerência e o demandante.')
        await db.transaction(async trx => {
            await lockAdmin(trx, req.user)
            const owner = await trx('users2').where({ id: validation.id(body.demandante_id) }).forUpdate().first()
            if (!active(owner)) fail(409, 'Demandante indisponível. Atualize a seleção.')
            const data = { nome: body.nome.trim(), demandante_id: owner.id }
            if (id === null) await trx('gerencias').insert(data)
            else {
                if (!await trx('gerencias').where({ id }).forUpdate().first()) fail(404, 'Gerência não encontrada.')
                await trx('gerencias').where({ id }).update(data)
            }
        })
        return res.status(204).send()
    })
    const removeGerencia = guarded(async (req, res) => {
        const id = routeId(req)
        await db.transaction(async trx => {
            await lockAdmin(trx, req.user)
            const row = await trx('gerencias').where({ id }).forUpdate().first()
            if (!row || row.deletedAt != null) fail(404, 'Gerência não encontrada.')
            if (await trx('colab').where({ gerencia_id: id }).whereNull('deletedAt').forUpdate().first()) fail(409, 'Transfira ou arquive os profissionais antes de arquivar a gerência.')
            await trx('gerencias').where({ id }).update({ deletedAt: new Date() })
        })
        return res.status(204).send()
    })
    const saveProfessional = guarded(async (req, res) => {
        const id = req.params.id === undefined ? null : routeId(req), data = validation.professional(req.body)
        if (!data) fail(400, 'Dados de profissional inválidos.')
        await db.transaction(async trx => {
            await lockAdmin(trx, req.user)
            const department = await trx('gerencias').where({ id: data.gerencia_id }).whereNull('deletedAt').forUpdate().first()
            if (!department) fail(409, 'Gerência indisponível. Atualize a seleção.')
            const owner = await trx('users2').where({ id: department.demandante_id }).first()
            if (!active(owner)) fail(409, 'A gerência precisa de um demandante ativo.')
            const values = { ...data, gerencia: department.nome, demandante: normalizeEmail(owner.email) }
            if (id === null) await trx('colab').insert(values)
            else {
                const row = await trx('colab').where({ id }).forUpdate().first()
                if (!row || row.deletedAt != null) fail(404, 'Profissional não encontrado.')
                await trx('colab').where({ id }).update(values)
            }
        })
        return res.status(204).send()
    })
    const removeProfessional = guarded(async (req, res) => {
        const id = routeId(req)
        await db.transaction(async trx => {
            await lockAdmin(trx, req.user)
            const row = await trx('colab').where({ id }).forUpdate().first()
            if (!row || row.deletedAt != null) fail(404, 'Profissional não encontrado.')
            await trx('colab').where({ id }).update({ deletedAt: new Date() })
        })
        return res.status(204).send()
    })
    return { getDemandantes, createDemandante, updateDemandante, removeDemandante,
        getGerencias, saveGerencia, removeGerencia, saveProfessional, removeProfessional }
}

module.exports = { createManagement, decorate }
