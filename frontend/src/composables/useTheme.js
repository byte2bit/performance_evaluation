import { readonly, ref } from 'vue'
import { createThemeController } from '@/js/theme.js'

const isDark = ref(false)
let controller = null

export function initializeTheme(browser) {
    controller?.dispose()
    let storage
    try { storage = browser.localStorage } catch { /* Storage can be disabled by the browser. */ }
    controller = createThemeController({
        root: browser.document.documentElement,
        media: browser.matchMedia('(prefers-color-scheme: dark)'),
        storage,
        onChange: value => { isDark.value = value },
    })
}

export function useTheme() {
    return { isDark: readonly(isDark), toggleTheme: () => controller?.toggle() }
}

if (import.meta.hot) import.meta.hot.dispose(() => controller?.dispose())
