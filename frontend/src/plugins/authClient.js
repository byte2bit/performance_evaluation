export function installAuthClient(api) {
    let token = null
    let pending = null
    let epoch = 0
    const listeners = new Set()
    function clearCsrf() { token = null; pending = null; epoch++ }
    function onUnauthorized(listener) { listeners.add(listener); return () => listeners.delete(listener) }
    async function csrfToken() {
        if (token) return token
        if (!pending) {
            const generation = epoch
            const task = api.get('/csrf-token').then(response => {
                if (generation !== epoch || !/^[a-f0-9]{64}$/.test(response.data?.csrfToken)) {
                    throw new Error('Não foi possível validar a sessão.')
                }
                token = response.data.csrfToken
                return token
            }).finally(() => { if (pending === task) pending = null })
            pending = task
        }
        return pending
    }
    api.interceptors.request.use(async config => {
        config.authEpoch = epoch
        if (!['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) {
            config.headers['Content-Type'] = 'application/json'
            config.headers['X-CSRF-Token'] = await csrfToken()
            if (config.data === undefined) config.data = {}
        }
        return config
    })
    api.interceptors.response.use(response => response, error => {
        if (error.response?.status === 401 && error.config?.authEpoch === epoch &&
            !['/signin', '/change-password'].includes(error.config?.url)) {
            clearCsrf()
            for (const listener of listeners) listener()
        }
        return Promise.reject(error)
    })
    return { clearCsrf, onUnauthorized }
}
