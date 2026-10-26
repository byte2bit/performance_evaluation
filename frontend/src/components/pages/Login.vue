<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore.js'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const email = ref('')
const password = ref('')

async function submit() {
    if (await auth.signin(email.value, password.value)) {
        password.value = ''
        await router.replace({ name: 'Form' })
    }
}
onBeforeUnmount(() => { password.value = '' })
</script>

<template>
    <main class="mx-auto my-12 w-full max-w-md p-6 bg-white rounded-lg shadow">
        <h1 class="text-xl font-bold mb-6">Entrar no sistema</h1>
        <p v-if="route.query.unavailable" role="alert" class="text-red-700 mb-4">Serviço indisponível. Tente novamente.</p>
        <p v-if="route.query.passwordChanged" role="status" class="text-green-700 mb-4">Senha alterada. Entre novamente.</p>
        <form @submit.prevent="submit" :aria-busy="auth.busy">
            <label for="login-email" class="block mb-1">E-mail</label>
            <input id="login-email" v-model="email" type="email" autocomplete="username" required maxlength="254"
                class="w-full border rounded p-2 mb-4" :disabled="auth.busy" />
            <label for="login-password" class="block mb-1">Senha</label>
            <input id="login-password" v-model="password" type="password" autocomplete="current-password" required maxlength="256"
                class="w-full border rounded p-2 mb-4" :disabled="auth.busy" />
            <p v-if="auth.error" role="alert" class="text-red-700 mb-4">{{ auth.error }}</p>
            <button type="submit" :disabled="auth.busy" class="bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-50">
                {{ auth.busy ? 'Entrando…' : 'Entrar' }}
            </button>
        </form>
    </main>
</template>
