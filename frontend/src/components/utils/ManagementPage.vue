<script>
import '@/styles/management-pages.css'

export default {
    props: {
        title: { type: String, required: true },
        description: { type: String, default: '' },
        narrow: { type: Boolean, default: false },
    },
}
</script>

<template>
    <main class="management-page">
        <div class="mp-content" :class="{ 'mp-content-narrow': narrow }">
            <nav class="mp-breadcrumb" aria-label="Localização">
                <router-link to="/">Início</router-link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{{ title }}</span>
            </nav>
            <header class="mp-heading">
                <div>
                    <span class="mp-eyebrow">Avaliação de desempenho</span>
                    <h1>{{ title }}</h1>
                    <p v-if="description">{{ description }}</p>
                </div>
                <div v-if="$slots.actions" class="mp-heading-actions"><slot name="actions" /></div>
            </header>
            <slot />
        </div>
    </main>
</template>
