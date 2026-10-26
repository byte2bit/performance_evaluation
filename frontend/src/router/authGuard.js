export function createAuthGuard(getAuth) {
    return async to => {
        if (to.meta.public) return true
        const auth = getAuth()
        try { await auth.restore() }
        catch { return { name: 'Login', query: { unavailable: '1' } } }
        if (!auth.user) return { name: 'Login' }
        if (to.meta.admin && !auth.user.admin) return { name: 'Form' }
        return true
    }
}
