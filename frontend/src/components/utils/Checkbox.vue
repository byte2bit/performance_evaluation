<template>
    <div class="flex items-center">


<!--         <input 
        name="chk[]" 
        type="checkbox" 
        :value="value" 
        :id="`checkbox-${value}`" 
        v-model="model" 
        class="w-3 h-3 accent-pink-500"
        > -->
               <input  type="checkbox"
                       class="w-6 h-6 accent-pink-500"
                       :checked="checkBoxSelection.selectedEmail.has(checkBox)"
                       @click="checkBoxSelection.toggle(checkBox)"
               >

        <label :for="`checkbox-${value}`" class="ms-2 lbl">{{ label }}</label>
    </div>
</template>


<script setup>
import { computed } from "vue";

const props = defineProps({
    checkBoxes: Array,
    modelValue: {
        type: Array,
        default: () => []
    },
    label: String
});

const emit = defineEmits(["update:modelValue"]);

const model = computed({
    get() {
        return props.modelValue;
    },
    set(value) {
        emit("update:modelValue", value);
    },
});
</script>

<!-- <template>
    <input 
    type="checkbox" 
    :value="label" 
    :checked="modelValue.includes(label)"
    @change="$emit('update:modelValue', $event.target.checked ? [...modelValue, label] : modelValue.filter(item => item !== label))">
</template>

<script>
export default {
    props: {
        modelValue: {
            type: Array,
            default: () => []
        },
        label: String
    },
}
</script> -->

<style scoped>
.chkbox {
    width: 0.7rem;
    height: 0.7rem;
}
.lbl{
    font-size: 0.6rem;
    font-weight: 500;
    color: #000;
}
</style>