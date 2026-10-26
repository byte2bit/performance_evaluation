<template>
    <div class="evaluation-professionals">
        <!-- Seleciona todos -->
        <div class="evaluation-select-all">
            <input id="select-all-colabs" type="checkbox" @change="toggleAllSelection"
                :checked="allCheckBoxesSelected" :indeterminate="partiallySelected"
                class="evaluation-checkbox">
            <label for="select-all-colabs">Todos</label>
        </div>

        <!-- Lista de checkboxes -->
        <div v-for="colab in colabStore.colabs" :key="colab.id" class="line-colabs">
            <input type="checkbox" :id="`checkbox-${colab.id}`" class="evaluation-checkbox"
                :checked="selectedColabs.includes(colab.id)" @change="colabStore.toggleColab(colab.id)">

            <label :for="`checkbox-${colab.id}`" class="evaluation-professional-name">
                {{ colab.colab }}
                <span v-if="colabStore.selectionDetails(colab)" class="block text-xs">
                    {{ colabStore.selectionDetails(colab) }}
                </span>
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
    colabStore.colabs.every(colab => selectedColabs.value.includes(colab.id))
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
