<template>
    <main class="management-page home-page">
        <div class="mp-content">
            <header class="mp-heading">
                <div>
                    <span class="mp-eyebrow">Área de avaliação</span>
                    <h1>Avaliação de desempenho</h1>
                    <p>Selecione os profissionais e avalie os quatro critérios do posto de serviço.</p>
                </div>
                <span class="mp-count" role="status">Selecionados: <strong>{{ colabStore.chkColabs.length }}</strong></span>
            </header>
            <div class="home">
                <aside class="mp-card evaluation-selection" aria-labelledby="professionals-title">
                    <div class="evaluation-selection-heading">
                        <span class="mp-eyebrow">01 · Seleção</span>
                        <h2 id="professionals-title">Profissionais</h2>
                        <p>Selecione quem deseja avaliar.</p>
                    </div>
                    <div id="checks"><ListCheckboxes /></div>
                </aside>
                <article aria-label="Critérios e resultado da avaliação"><Form /></article>
            </div>
        </div>
    </main>
</template>

<script setup>
import ListCheckboxes from '../ListCheckboxes.vue'
import Form from './Form.vue';
import { useColabStore } from '@/stores/colabStore.js'
import '@/styles/management-pages.css'
import '@/styles/evaluation-pages.css'

const colabStore = useColabStore()

</script>

<style lang="scss" scoped>
.home {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
}

#checks {
    max-height: min(60vh, 640px);
    overflow: auto;
}

aside {
    position: sticky;
    top: 24px;
}

article {
    min-width: 0;
}

@media (max-width: 1023px) {
    .home {
        grid-template-columns: minmax(0, 1fr);
    }
    aside {
        position: static;
    }
    #checks {
        max-height: 14rem;
    }
}
</style>
