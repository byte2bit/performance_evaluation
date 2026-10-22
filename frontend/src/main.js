import { createApp } from 'vue'
import '@/style.css'
import App from './App.vue'
import router from '@/router/index.js'
import { createPinia } from 'pinia'
import { sanitizePlugin } from "v-sanitize-directive"

createApp(App)
    .use(router)
    .use(sanitizePlugin)
    .use(createPinia())
    .mount('#app')
