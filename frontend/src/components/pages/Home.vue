<template>
    <aside class="bg-zinc-200 p-4">
        <h4 class="mb-3">Selecione o(s) colaborador(es) para avaliar:</h4>
        <div id="checks" class="ps-1">
            <ListCheckboxes />
        </div>
    </aside>
    <article>
        <Form />
    </article>
</template>

<script setup>
import ListCheckboxes from '../ListCheckboxes.vue'
import Form from './Form.vue';


</script>

<style lang="scss" scoped>
#checks {
    height: calc(100vh - 170px);
    overflow: auto;
}

aside {
    height: calc(100vh - 110px);
}
</style>