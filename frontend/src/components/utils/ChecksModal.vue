<template>
    <teleport to="body">
        <div :id="id" ref="modalElement" tabindex="-1" aria-hidden="true" :aria-labelledby="`${id}-title`"
            class="app-modal fixed inset-0 z-50 hidden w-full overflow-y-auto">
            <div class="app-modal-panel app-modal-large">
                <header class="app-modal-header">
                    <span class="app-modal-eyebrow">Resumo da avaliação</span>
                    <h3 :id="`${id}-title`">Revisão</h3>
                </header>
                <div class="app-modal-body"><slot name="bodyModal">Conteúdo do Modal</slot></div>
                <div class="app-modal-footer">
                    <button @click="visible = false" type="button" class="app-modal-button app-modal-primary">Enviar</button>
                    <button @click="visible = false" type="button" class="app-modal-button">Cancelar</button>
                </div>
            </div>
        </div>
    </teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useFlowbiteModal } from '@/composables/useFlowbiteModal.js'

defineProps({ id: { type: String, default: 'large-modal' } })
const visible = defineModel({ type: Boolean, default: false })
const modalElement = ref(null)
useFlowbiteModal(modalElement, visible)

</script>

<style lang="scss" scoped></style>
