<template>
    <teleport to="body">
        <div :id="id" ref="modalElement" tabindex="-1" aria-hidden="true" :aria-labelledby="`${id}-title`"
            class="app-modal fixed inset-0 z-50 hidden w-full overflow-y-auto">
            <div class="app-modal-panel">
                <header class="app-modal-header">
                    <span class="app-modal-eyebrow">Critérios da avaliação</span>
                    <div :id="`${id}-title`"><slot name="headerModal">Título</slot></div>
                </header>
                <div class="app-modal-body"><slot name="bodyModal">Conteúdo do Modal</slot></div>
                <div class="app-modal-footer">
                    <button type="button" class="app-modal-button app-modal-primary" @click="closeModal">OK</button>
                </div>
            </div>
        </div>
    </teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useFlowbiteModal } from '@/composables/useFlowbiteModal.js'

defineProps({ id: { type: String, default: 'sub-modal' } })
const simpleModalFlag = defineModel('simpleModalFlag', { type: Boolean, default: false })
const modalElement = ref(null)
useFlowbiteModal(modalElement, simpleModalFlag)

const closeModal = () => {
    simpleModalFlag.value = false
};

</script>

<style lang="scss" scoped></style>
