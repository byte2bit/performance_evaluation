import { reactive } from 'vue'

const dados = reactive({ nome: '', email: '', admin: false })
let currentUser = ''

function setIdentity(user) {
    currentUser = user ? String(user.id) : ''
    Object.assign(dados, { nome: user?.name || '', email: user?.email || '', admin: user?.admin === true })
}

export { dados, currentUser, setIdentity }
