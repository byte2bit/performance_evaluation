import { defineStore } from 'pinia'
import { ref, onScopeDispose } from 'vue'
import api, { clearCsrf, onUnauthorized } from '@/plugins/axios.js'
import { setIdentity } from '@/js/store.js'
import { useColabStore } from './colabStore.js'

function errorMessage(error) {
    if (error.response?.status === 400) return 'Confira os dados informados e tente novamente.'
    if (error.response?.status === 429) return 'Muitas tentativas. Aguarde antes de tentar novamente.'
    if (error.response?.status === 401) return 'E-mail ou senha inválidos.'
    if (error.response?.status === 403) return 'Não foi possível validar a sessão. Recarregue a página e tente novamente.'
    return 'Não foi possível concluir a operação. Verifique a conexão e tente novamente.'
}

export const useAuthStore = defineStore('auth', () => {
    const user = ref(null)
    const busy = ref(false)
    const error = ref('')
    const colabs = useColabStore()
    let pendingSession = null
    let generation = 0

    function assign(value) {
        if (user.value?.id !== value?.id || user.value?.admin !== value?.admin || user.value?.email !== value?.email) colabs.clearPrivateData()
        user.value = value
        setIdentity(value)
    }
    function clear() {
        generation++
        clearCsrf()
        colabs.clearPrivateData()
        assign(null)
    }
    onScopeDispose(onUnauthorized(clear))

    async function restore() {
        if (!pendingSession) {
            const started = generation
            const task = api.get('/session').then(response => {
                if (started === generation) assign(response.data)
                return user.value
            }).catch(failure => {
                if (started === generation) clear()
                if (failure.response?.status !== 401) throw failure
                return null
            }).finally(() => { if (pendingSession === task) pendingSession = null })
            pendingSession = task
        }
        return pendingSession
    }
    async function signin(email, password) {
        if (busy.value) return false
        busy.value = true
        error.value = ''
        try {
            const response = await api.post('/signin', { email, password })
            generation++
            pendingSession = null
            clearCsrf()
            assign(response.data)
            return true
        } catch (failure) { error.value = errorMessage(failure); return false }
        finally { busy.value = false }
    }
    async function signout() {
        if (busy.value) return false
        busy.value = true
        error.value = ''
        try {
            await api.post('/signout')
            clear()
            return true
        } catch (failure) {
            if (failure.response?.status === 401) { clear(); return true }
            error.value = errorMessage(failure)
            return false
        } finally { busy.value = false }
    }
    async function changePassword(currentPassword, newPassword) {
        if (busy.value) return false
        busy.value = true
        error.value = ''
        try {
            await api.post('/change-password', { currentPassword, newPassword })
            clear()
            return true
        } catch (failure) {
            if (failure.response?.status === 401) {
                try { await restore() } catch { /* The service error is shown below. */ }
            }
            error.value = failure.response?.status === 401
                ? 'A senha atual não foi confirmada. Sua senha não foi alterada.' : errorMessage(failure)
            return false
        } finally { busy.value = false }
    }
    return { user, busy, error, restore, signin, signout, changePassword, clear }
})
