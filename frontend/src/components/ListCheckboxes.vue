<template>
    <div>
        <!-- Seleciona todos -->
        <input id="select-all-colabs" type="checkbox" @change="toggleAllSelection"
            :checked="allCheckBoxesSelected" :indeterminate="partiallySelected"
            class="w-3 h-3 accent-pink-500">
        <label for="select-all-colabs" class="ms-2 font-bold">Todos</label>

        <!-- Lista de checkboxes -->
        <div v-for="colab in colabStore.colabs" :key="colab.id" class="line-colabs">
            <input type="checkbox" :id="`checkbox-${colab.id}`" class="w-3 h-3 accent-pink-500"
                :checked="selectedColabs.includes(colab.colab)" @change="colabStore.toggleColab(colab.colab)">

            <label :for="`checkbox-${colab.id}`" class="ms-2">
                {{ colab.colab }}
            </label>
        </div>

    </div>
</template>

<script setup>
import { onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useColabStore } from '@/stores/colabStore'

const colabStore = useColabStore()
const { chkColabs: selectedColabs } = storeToRefs(colabStore)

const allCheckBoxesSelected = computed(() =>
    colabStore.colabs.length > 0 &&
    colabStore.colabs.every(colab => selectedColabs.value.includes(colab.colab))
)
const partiallySelected = computed(() => selectedColabs.value.length > 0 && !allCheckBoxesSelected.value)

function toggleAllSelection() {
    if (allCheckBoxesSelected.value) {
        colabStore.clearSelection()
    } else {
        colabStore.selectAllColabs()
    }
}

onMounted(() => {
    colabStore.loadColabs()
})
</script>


<style scoped>
label {
    font-size: 10px;
    font-weight: normal;
}
.line-colabs{
    line-height: 1;
}
</style>
