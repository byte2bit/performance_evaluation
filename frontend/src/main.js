import { createApp } from 'vue'
import '@/style.css'
import App from './App.vue'
import router from '@/router/index.js'
import { createPinia } from 'pinia'
import { sanitizePlugin } from "v-sanitize-directive"
import { initializeTheme } from '@/composables/useTheme.js'

initializeTheme(window)

createApp(App)
    .use(createPinia())
    .use(router)
    .use(sanitizePlugin)
    .mount('#app')
