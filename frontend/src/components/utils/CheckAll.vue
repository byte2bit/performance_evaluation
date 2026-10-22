<template>
    <div class="flex flex-col gap-2 p-5">
        <h1>Multiple checkboxes with an Array</h1>
        <div class="flex gap-2">
            <input class="checkbox" type="checkbox" v-model="checked" :indeterminate="indeterminate" id="select-all" />
            <label for="select-all">Select all</label>
        </div>
        <hr />
        <div v-for="(option, index) of items" :key="index" class="flex gap-2">
            <input type="checkbox" :value="option" v-model="selectedItems" class="checkbox" :id="`option-${index}`" />
            <label :for="`option-${index}`">{{ option }}</label>
        </div>

        <div>Selected items: {{ selectedItems }}</div>
    </div>
</template>

<script lang="ts" setup>
import { useCheckboxSelectAll } from '../../composables/useCheckboxSelectAll.ts'
import { ref } from 'vue'

const items = ref<Array<string>>(['Option 1', 'Option 2', 'Option 3'])
const selectedItems = ref<string[]>([])

// select all checkbox state
const { checked, indeterminate } = useCheckboxSelectAll(items, selectedItems)
</script>

<style lang="scss" scoped></style>