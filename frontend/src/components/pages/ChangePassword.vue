<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore.js'

const auth = useAuthStore()
const router = useRouter()
const currentPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')
const validationError = ref('')

async function submit() {
    validationError.value = ''
    if ([...newPassword.value].length < 15 || [...newPassword.value].length > 128 || newPassword.value !== confirmation.value) {
        validationError.value = 'Use de 15 a 128 caracteres e confirme a mesma senha.'
        return
    }
    if (await auth.changePassword(currentPassword.value, newPassword.value)) {
        await router.replace({ name: 'Login', query: { passwordChanged: '1' } })
    }
}
onBeforeUnmount(() => { currentPassword.value = ''; newPassword.value = ''; confirmation.value = '' })
</script>

<template>
    <main class="mx-auto my-12 w-full max-w-md p-6 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg shadow">
        <h1 class="text-xl font-bold mb-6">Alterar senha</h1>
        <form @submit.prevent="submit" :aria-busy="auth.busy">
            <label for="current-password" class="block mb-1">Senha atual</label>
            <input id="current-password" v-model="currentPassword" type="password" autocomplete="current-password" required
                class="w-full border dark:border-gray-600 dark:bg-gray-900 rounded p-2 mb-4" :disabled="auth.busy" />
            <label for="new-password" class="block mb-1">Nova senha (15 a 128 caracteres)</label>
            <input id="new-password" v-model="newPassword" type="password" autocomplete="new-password" required maxlength="256"
                class="w-full border dark:border-gray-600 dark:bg-gray-900 rounded p-2 mb-4" :disabled="auth.busy" />
            <label for="confirm-password" class="block mb-1">Confirme a nova senha</label>
            <input id="confirm-password" v-model="confirmation" type="password" autocomplete="new-password" required maxlength="256"
                class="w-full border dark:border-gray-600 dark:bg-gray-900 rounded p-2 mb-4" :disabled="auth.busy" />
            <p v-if="validationError || auth.error" role="alert" class="text-red-700 dark:text-red-300 mb-4">{{ validationError || auth.error }}</p>
            <button type="submit" :disabled="auth.busy" class="bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-50">
                {{ auth.busy ? 'Alterando…' : 'Alterar senha' }}
            </button>
        </form>
    </main>
</template>
