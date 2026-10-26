const path = require('node:path')
const readline = require('node:readline/promises')

function hiddenPassword(prompt, input = process.stdin, output = process.stdout) {
    return new Promise((resolve, reject) => {
        const wasRaw = input.isRaw
        let value = ''
        const finish = error => {
            input.off('data', onData)
            input.off('end', onEnd)
            input.setRawMode(Boolean(wasRaw))
            input.pause()
            output.write('\n')
            error ? reject(error) : resolve(value)
        }
        const onEnd = () => finish(new Error('Entrada encerrada.'))
        const onData = data => {
            for (const character of data.toString()) {
                if (character === '\u0003') return finish(new Error('Cancelado.'))
                if (character === '\r' || character === '\n') return finish()
                if (character === '\u007f' || character === '\b') value = [...value].slice(0, -1).join('')
                else if (character >= ' ') value += character
            }
        }
        output.write(prompt)
        input.setRawMode(true)
        input.on('data', onData)
        input.once('end', onEnd)
        input.resume()
    })
}

async function main(args = process.argv.slice(2)) {
    const [action, option, configPath, ...extra] = args
    if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode || extra.length ||
        option !== '--config' || !configPath ||
        !['create-admin', 'create-evaluator', 'disable', 'promote', 'demote', 'activate'].includes(action)) {
        throw new Error('Use um terminal interativo e uma configuração de banco explícita.')
    }
    // Never import the application, its .env, seeds or migration runner.
    const settings = require(path.resolve(configPath))
    if (settings.client !== 'mysql' || typeof settings.connection !== 'object' ||
        typeof settings.connection.database !== 'string' || !settings.connection.database) throw new Error('Configuração inválida.')
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
    let data
    try {
        const target = settings.connection
        console.log(`Destino: ${target.host || 'localhost'}:${target.port || 3306}/${target.database}`)
        const confirmation = await terminal.question(`Para executar ${action}, digite ALTERAR ${target.database}: `)
        if (confirmation !== `ALTERAR ${target.database}`) throw new Error('Destino não confirmado.')
        if (action.startsWith('create-')) data = {
            name: await terminal.question('Nome: '), email: await terminal.question('E-mail: '), admin: action === 'create-admin'
        }
        else data = { id: Number(await terminal.question('ID da conta: ')) }
    } finally { terminal.close() }
    if (action.startsWith('create-') || action === 'activate') {
        data.password = await hiddenPassword('Nova senha (15 a 128 caracteres): ')
        if (data.password !== await hiddenPassword('Confirme a senha: ')) throw new Error('Confirmação inválida.')
    }
    const db = require('knex')({ client: 'mysql', connection: settings.connection, debug: false })
    try {
        const accounts = require('../lib/auth/accounts').createAccounts(db)
        if (action.startsWith('create-')) await accounts.create(data)
        else await accounts.change(data.id, action, data.password)
        console.log('Operação concluída.')
    } finally {
        data.password = undefined
        await db.destroy()
    }
}

if (require.main === module) main().catch(() => {
    console.error('Operação não concluída. Confira os argumentos, a configuração, o destino e as regras da conta.')
    process.exitCode = 1
})

module.exports = { main, hiddenPassword }
