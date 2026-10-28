const has = (value, key) => Object.hasOwn(value, key)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
const text = (value, { required = false, nullable = false } = {}) => nullable && value === null ||
    typeof value === 'string' && [...value].length <= 255 && (!required || value.trim().length > 0)

function decimal(value) {
    if (typeof value === 'string' && (!text(value) || !/^\d+(?:\.\d+)?$/.test(value))) return null
    if (typeof value === 'string' && (value.split('.')[1] || '').replace(/0+$/, '').length > 3) return null
    if (!['string', 'number'].includes(typeof value)) return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

function integer(value, maximum = Number.MAX_SAFE_INTEGER) {
    if (typeof value === 'string' && (!/^[1-9]\d{0,15}$/.test(value))) return null
    if (!['string', 'number'].includes(typeof value)) return null
    const number = Number(value)
    return Number.isSafeInteger(number) && number > 0 && number <= maximum ? number : null
}

const id = value => integer(value, 4294967295)

function pagination(query = {}) {
    if (!object(query)) return null
    const page = has(query, 'page') ? integer(query.page) : 1
    const limit = has(query, 'limit') ? integer(query.limit, 100) : 25
    if (page === null || limit === null) return null
    const offset = (page - 1) * limit
    return Number.isSafeInteger(offset) ? { page, limit, offset } : null
}

function professional(body) {
    if (!object(body) || !text(body.colab, { required: true })) return null
    const gerenciaId = id(body.gerencia_id)
    if (gerenciaId === null) return null
    const result = { colab: body.colab, gerencia_id: gerenciaId }
    for (const field of ['matricula', 'ppu', 'servico', 'funcao', 'liderancas']) {
        if (!has(body, field)) continue
        if (!text(body[field], { nullable: true })) return null
        result[field] = body[field]
    }
    return result
}

function evaluation(body) {
    if (!object(body) || !text(body.colab, { required: true })) return null
    const result = { colab: body.colab }
    if (has(body, 'colab_id')) {
        const professionalId = id(body.colab_id)
        if (professionalId === null) return null
        result.colab_id = professionalId
    }
    const notes = []
    for (const criterion of ['qualidade', 'prazo', 'dispon', 'respon']) {
        const note = decimal(body['nota_' + criterion])
        const observation = body['obs_' + criterion]
        if (note === null || note < 1 || note > 5 || !Number.isInteger(note * 2) || !text(observation)) return null
        notes.push(note)
        result['nota_' + criterion] = String(body['nota_' + criterion])
        result['obs_' + criterion] = observation
    }
    const average = notes.reduce((sum, note) => sum + note, 0) / 4
    const bands = [
        [4.5, 5, 'A', '0%'], [4, 4.4, 'B', '1%'], [3.5, 3.9, 'C', '2%'],
        [2.5, 3.4, 'D', '3%'], [1, 2.4, 'E', '5%']
    ]
    const band = bands.find(([minimum, maximum]) => average >= minimum && average <= maximum)
    if (!band || decimal(body.avaliacao) !== average || body.nivel !== band[2] || body.desconto !== band[3]) return null
    Object.assign(result, { avaliacao: String(body.avaliacao), nivel: body.nivel, desconto: body.desconto })
    for (const [field, index] of [['itensQualidade', 0], ['itensDispon', 2]]) {
        if (has(body, field)) {
            if (!text(body[field])) return null
            result[field] = body[field]
        }
        if (notes[index] <= 3 && !text(body[field], { required: true })) return null
    }
    if (has(body, 'liderancas')) {
        if (!text(body.liderancas, { nullable: true })) return null
        result.liderancas = body.liderancas
    }
    return result
}

module.exports = { professional, evaluation, pagination, id }
