const criteria = [
    { key: 'nota_qualidade', label: 'Qualidade', color: '#3b82f6', dash: '' },
    { key: 'nota_prazo', label: 'Prazo', color: '#b45309', dash: '8 3' },
    { key: 'nota_dispon', label: 'Disponibilidade', color: '#16a34a', dash: '3 3' },
    { key: 'nota_respon', label: 'Responsabilidade', color: '#a855f7', dash: '10 3 2 3' },
    { key: 'avaliacao', label: 'Média geral', color: '#f43f5e', dash: '2 4' },
]
export { criteria }

export function recordDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(value)) return null
    const date = value.slice(0, 10), [year, month, day] = date.split('-').map(Number)
    if (year < 1000 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null
    return date
}

export function formatRecordDate(value, withTime = false) {
    const date = recordDate(value)
    if (!date) return 'Data não informada'
    const formatted = date.split('-').reverse().join('/')
    const time = withTime && value.match(/[T ](\d{2}:\d{2}:\d{2})/)
    return formatted + (time ? ` às ${time[1]}${value.endsWith('Z') ? ' (UTC)' : ''}` : '')
}

export function periodError(start, end) {
    if ((start && recordDate(start) !== start) || (end && recordDate(end) !== end)) return 'Informe datas válidas.'
    if (start && end && start > end) return 'A data inicial deve ser anterior ou igual à data final.'
    return ''
}

export function displayValue(value) {
    if (value == null || value === '') return 'Não informado'
    if (Array.isArray(value)) return value.length ? value.map(displayValue).join('; ') : 'Não informado'
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function filterRecords(records, start = '', end = '', search = '', fields = []) {
    if (periodError(start, end)) return []
    const term = normalize(search.trim())
    return records.filter(record => {
        const date = recordDate(record.created_at)
        if ((start || end) && (!date || (start && date < start) || (end && date > end))) return false
        return !term || fields.some(key => normalize(key === 'created_at' ?
            `${formatRecordDate(record.created_at)} ${record.created_at || ''}` : record[key] == null ? '' : displayValue(record[key])).includes(term))
    })
}

export function buildMonthlyHistory(records) {
    const groups = new Map()
    for (const record of records) {
        const date = recordDate(record.created_at)
        if (!date) continue
        const month = date.slice(0, 7)
        if (!groups.has(month)) groups.set(month, [])
        groups.get(month).push(record)
    }
    return [...groups].sort(([left], [right]) => left.localeCompare(right)).map(([month, rows]) => {
        const [year, number] = month.split('-').map(Number)
        const result = { month, ordinal: year * 12 + number - 1, label: `${String(number).padStart(2, '0')}/${year}`, count: rows.length }
        for (const { key } of criteria) {
            const values = rows.map(row => row[key]).filter(value =>
                (typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) &&
                Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 5).map(Number)
            result[key] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
        }
        return result
    })
}
