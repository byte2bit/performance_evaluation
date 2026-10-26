const themeKey = 'evaluation-theme'

// Only a visual preference is stored. A blocked/unavailable storage must not break UI.
export function createThemeController({ root, media, storage, onChange = () => {} }) {
    let preference = null
    try {
        const saved = storage?.getItem(themeKey)
        if (saved === 'light' || saved === 'dark') preference = saved
    } catch { /* Use the system preference. */ }
    let dark = false
    function apply(value) {
        dark = value
        root.classList.toggle('dark', dark)
        onChange(dark)
    }
    function systemChanged(event) {
        if (preference === null) apply(event.matches)
    }
    apply(preference === null ? media.matches : preference === 'dark')
    media.addEventListener('change', systemChanged)
    return {
        toggle() {
            preference = dark ? 'light' : 'dark'
            apply(preference === 'dark')
            try { storage?.setItem(themeKey, preference) } catch { /* Keep the current choice in memory. */ }
        },
        dispose() { media.removeEventListener('change', systemChanged) },
    }
}
