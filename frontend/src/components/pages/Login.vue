<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore.js'
import '@/styles/management-pages.css'
import '@/styles/evaluation-pages.css'

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
    <main class="management-page login-page">
      <div class="login-layout mp-card">
        <section class="login-intro" aria-labelledby="login-intro-title">
            <span class="login-brand" role="img" aria-label="Núcleo Engenharia e Consultoria"></span>
            <div>
                <span class="login-overline">Avaliação de desempenho</span>
                <h2 id="login-intro-title">Acompanhe a qualidade de cada serviço.</h2>
                <p>Avalie o desempenho dos profissionais e consulte o histórico de resultados em um só lugar.</p>
            </div>
            <ul class="login-criteria" aria-label="Critérios de avaliação">
                <li>Qualidade</li><li>Prazo</li><li>Disponibilidade</li><li>Responsabilidade</li>
            </ul>
        </section>
        <section class="login-form-panel" aria-labelledby="login-title">
          <span class="mp-eyebrow">Acesso ao sistema</span>
          <h1 id="login-title">Entrar no sistema</h1>
          <p class="login-description">Use sua conta para acessar as avaliações e os profissionais.</p>
          <p v-if="route.query.unavailable" role="alert" class="login-message login-message-error">Serviço indisponível. Tente novamente.</p>
          <p v-if="route.query.passwordChanged" role="status" class="login-message login-message-success">Senha alterada. Entre novamente.</p>
          <form @submit.prevent="submit" :aria-busy="auth.busy">
            <div class="mp-field">
                <label for="login-email">E-mail</label>
                <input id="login-email" v-model="email" type="email" autocomplete="username" required maxlength="254"
                    class="mp-input" placeholder="seu.email@empresa.com" :disabled="auth.busy" />
            </div>
            <div class="mp-field">
                <label for="login-password">Senha</label>
                <input id="login-password" v-model="password" type="password" autocomplete="current-password" required maxlength="256"
                    class="mp-input" placeholder="Digite sua senha" :disabled="auth.busy" />
            </div>
            <p v-if="auth.error" role="alert" class="login-message login-message-error">{{ auth.error }}</p>
            <button type="submit" :disabled="auth.busy" class="mp-button mp-button-primary login-submit">
                {{ auth.busy ? 'Entrando…' : 'Entrar' }}
            </button>
          </form>
          <p class="login-footnote">Núcleo · Avaliação de Nível de Serviço</p>
        </section>
      </div>
    </main>
</template>
