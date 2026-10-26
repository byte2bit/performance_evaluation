<template>
    <header>
        <div class="header-layout">
            <img src="@/assets/logo-horizontal branco.png" class="header-logo" alt="Núcleo Logo" />
            <router-link to="/" class="header-title">Núcleo Avaliação de Nível de Serviço</router-link>
            <div class="header-actions">
                <button type="button" class="header-icon-button" @click="toggleTheme" :aria-pressed="isDark"
                    :aria-label="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'"
                    :title="isDark ? 'Ativar tema claro' : 'Ativar tema escuro'">
                    <svg v-if="isDark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path stroke-linecap="round" d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
                    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path stroke-linejoin="round" d="M20.5 14.2A9 9 0 0 1 9.8 3.5a9 9 0 1 0 10.7 10.7Z"/></svg>
                </button>
                <div ref="accountRoot" class="account-menu" @keydown.esc="onAccountEscape">
                    <button ref="accountButton" id="account-button" type="button" class="account-button"
                        :aria-expanded="accountOpen" aria-controls="account-dropdown" @click="accountOpen = !accountOpen"
                        @keydown.down.prevent="openAccountWithFocus">
                        <span class="account-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.5"/><path stroke-linecap="round" d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg></span>
                        <span>Minha conta</span>
                        <svg class="account-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>
                    </button>
                    <section v-if="accountOpen" id="account-dropdown" class="account-dropdown" aria-labelledby="account-button">
                        <div class="account-identity">
                            <span class="account-label">Conta conectada</span>
                            <p class="account-name">{{ auth.user?.name }}</p>
                            <p class="account-email">{{ auth.user?.email }}</p>
                        </div>
                        <div class="account-options">
                            <router-link to="/senha" @click="accountOpen = false">Alterar senha</router-link>
                            <button type="button" @click="signout" :disabled="auth.busy">{{ auth.busy ? 'Saindo…' : 'Sair' }}</button>
                        </div>
                        <p v-if="auth.error" role="alert" class="account-error">{{ auth.error }}</p>
                    </section>
                </div>
            </div>
        </div>
        <nav class="bg-gray-600 text-white">
            <div class="flex flex-wrap items-center justify-between 2xl:mx-auto px-4 py-2">

                <button @click="menuOpen = !menuOpen" type="button"
                    class="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-white rounded-lg md:hidden hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
                    aria-controls="navbar-default" :aria-expanded="menuOpen">
                    <span class="sr-only">Abrir menu principal</span>
                    <svg class="w-5 h-5"  xmlns="http://www.w3.org/2000/svg" fill="none"
                        viewBox="0 0 17 14">
                        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M1 1h15M1 7h15M1 13h15" />
                    </svg>
                </button>

                <div :class="{ hidden: !menuOpen }" class="w-full md:block md:w-auto" id="navbar-default">
                    <ul
                        class="text-sm flex flex-col p-4 md:p-0 mt-4 border  text-white border-gray-100 rounded-lg md:flex-row md:space-x-8 rtl:space-x-reverse md:mt-0 md:border-0">
                        <li>
                            <router-link to="/"
                                class="block py-2 px-3 rounded-sm md:bg-transparent md:p-0 hover:text-yellow-200"
                                aria-label="Início">
                                    <svg class="ms-1 h-5 w-5 fill-white hover:fill-yellow-200"
                                        viewBox="0 0 576 512" alt="Início"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.-->
                                        <path
                                            d="M575.8 255.5c0 18-15 32.1-32 32.1h-32l.7 160.2c0 2.7-.2 5.4-.5 8.1v16.2c0 22.1-17.9 40-40 40h-16c-1.1 0-2.2 0-3.3-.1-1.4.1-2.8.1-4.2.1L416 512h-24c-22.1 0-40-17.9-40-40v-88c0-17.7-14.3-32-32-32h-64c-17.7 0-32 14.3-32 32v88c0 22.1-17.9 40-40 40h-55.9c-1.5 0-3-.1-4.5-.2-1.2.1-2.4.2-3.6.2h-16c-22.1 0-40-17.9-40-40V360c0-.9 0-1.9.1-2.8v-69.7h-32c-18 0-32-14-32-32.1 0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7l255.4 224.5c8 7 12 15 11 24z" />
                                    </svg>
                            </router-link>
                        </li>
                        <li>
                            <router-link to="/registros"
                                class="block py-2 px-3 rounded-sm md:bg-transparent md:p-0 hover:text-yellow-200">
                                Registros
                            </router-link>
                        </li>
                        <li>
                            <router-link to="/colabs"
                                class="block py-2 px-3 text-white rounded-sm md:border-0 hover:text-yellow-200 md:p-0  ">
                                <!-- class="block py-2 px-3 text-white rounded-sm hover:bg-blue-900  md:border-0 md:hover:text-yellow-200 md:p-0  "> -->
                                Lista de profissionais
                            </router-link>
                        </li>
                        <li v-if="auth.user?.admin">
                            <router-link to="/inserir"
                                class="block py-2 px-3 text-white rounded-sm  md:border-0 hover:text-yellow-200 md:p-0  ">
                                Inserir profissional
                            </router-link>
                        </li>

                    </ul>
                </div>
            </div>
        </nav>

    </header>
</template>

<script setup>
import { ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore.js'
import { useTheme } from '@/composables/useTheme.js'
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { isDark, toggleTheme } = useTheme()
const menuOpen = ref(false)
const accountOpen = ref(false)
const accountRoot = ref(null)
const accountButton = ref(null)
let ownerDocument = null

function closeAccount(restoreFocus = false) {
    if (!accountOpen.value) return
    accountOpen.value = false
    if (restoreFocus) accountButton.value?.focus()
}
function onAccountEscape(event) {
    if (!accountOpen.value) return
    event.preventDefault()
    event.stopPropagation()
    closeAccount(true)
}
async function openAccountWithFocus() {
    accountOpen.value = true
    await nextTick()
    accountRoot.value?.querySelector('a')?.focus()
}
function outsideAccount(event) {
    if (!accountRoot.value?.contains(event.target)) closeAccount()
}
onMounted(() => {
    ownerDocument = accountRoot.value?.ownerDocument
    ownerDocument?.addEventListener('pointerdown', outsideAccount)
    ownerDocument?.addEventListener('focusin', outsideAccount)
})
onBeforeUnmount(() => {
    ownerDocument?.removeEventListener('pointerdown', outsideAccount)
    ownerDocument?.removeEventListener('focusin', outsideAccount)
})
watch(() => route.fullPath, () => { accountOpen.value = false; menuOpen.value = false })
async function signout() {
    if (await auth.signout()) await router.replace({ name: 'Login' })
}
</script>

<style scoped>
.header-layout { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 24px; padding: 16px clamp(16px, 3vw, 48px); background: var(--mp-surface); color: var(--mp-text); border-bottom: 1px solid var(--mp-line); }
.header-logo { width: 116px; height: auto; border-radius: 6px; background: #18263c; padding: 5px; }
.header-title { font-size: 18px; font-weight: 600; line-height: 1.5; text-align: center; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.header-icon-button, .account-button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; border: 1px solid var(--mp-line); border-radius: 10px; color: var(--mp-text); background: var(--mp-surface); cursor: pointer; }
.header-icon-button { width: 44px; }
.header-icon-button svg, .account-avatar svg { width: 20px; height: 20px; }
.header-icon-button:hover, .account-button:hover { background: var(--mp-hover); }
.account-menu { position: relative; }
.account-button { gap: 9px; padding: 6px 10px; font-size: 13px; font-weight: 600; }
.account-avatar { display: inline-flex; align-items: center; justify-content: center; color: var(--mp-accent); }
.account-chevron { width: 16px; height: 16px; }
.account-dropdown { position: absolute; right: 0; top: calc(100% + 10px); z-index: 40; width: 280px; max-width: calc(100vw - 32px); background: var(--mp-surface); border: 1px solid var(--mp-line); border-radius: 14px; box-shadow: 0 12px 40px #02061726; overflow: hidden; }
.account-identity { padding: 20px; background: var(--mp-muted-bg); border-bottom: 1px solid var(--mp-line); overflow-wrap: anywhere; }
.account-label { font-size: 10px; color: var(--mp-accent); text-transform: uppercase; letter-spacing: .1em; font-weight: 700; }
.account-name { font-size: 14px; font-weight: 700; line-height: 1.5; margin: 8px 0 4px; }
.account-email { font-size: 12px; color: var(--mp-muted); line-height: 1.6; margin: 0; }
.account-options { padding: 8px; }
.account-options a, .account-options button { display: block; text-align: left; width: 100%; padding: 12px; border-radius: 8px; font-size: 13px; color: var(--mp-text); cursor: pointer; }
.account-options a:hover, .account-options button:hover { background: var(--mp-hover); }
.account-options button:disabled { opacity: .6; cursor: wait; }
.account-error { font-size: 12px; line-height: 1.6; color: #b91c1c; padding: 0 20px 16px; margin: 0; }
.dark .account-error { color: #fca5a5; }
.header-layout :is(a, button):focus-visible { outline: 3px solid #60a5fa; outline-offset: 3px; }
@media (max-width: 767px) {
    .header-layout { grid-template-columns: minmax(0, 1fr) auto; gap: 14px; }
    .header-title { grid-row: 2; grid-column: 1 / -1; font-size: 15px; text-align: left; }
    .header-actions { gap: 8px; }
    .account-button { gap: 7px; }
}
@media (max-width: 359px) {
    .header-logo { width: 96px; }
    .account-chevron { display: none; }
    .account-button { font-size: 12px; padding-inline: 8px; }
}
</style>
