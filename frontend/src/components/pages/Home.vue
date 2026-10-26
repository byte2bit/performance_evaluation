<template>
    <div class="home">
        <aside class="bg-zinc-200 p-4">
            <h4 class="mb-3">Selecione o(s) colaborador(es) para avaliar:</h4>
            <div id="checks" class="ps-1">
                <ListCheckboxes />
            </div>
        </aside>
        <article>
            <Form />
        </article>
    </div>
</template>

<script setup>
import ListCheckboxes from '../ListCheckboxes.vue'
import Form from './Form.vue';


</script>

<style lang="scss" scoped>
.home {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
}

#checks {
    max-height: calc(100vh - 170px);
    overflow: auto;
}

aside {
    min-height: calc(100vh - 150px);
}

article {
    min-width: 0;
}

@media (max-width: 1023px) {
    .home {
        grid-template-columns: minmax(0, 1fr);
    }
    aside {
        min-height: 0;
    }
    #checks {
        max-height: 14rem;
    }
}
</style>
