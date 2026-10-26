<script setup>
import { ref } from 'vue'
import { useFlowbiteModal } from '@/composables/useFlowbiteModal.js'

defineProps({ id: { type: String, required: true } })
const visible = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['confirm'])
const modalElement = ref(null)
useFlowbiteModal(modalElement, visible)

function confirm() {
    if (!visible.value) return
    visible.value = false
    emit('confirm')
}
</script>

<template>
    <teleport to="body">
        <div :id="id" ref="modalElement" tabindex="-1" aria-hidden="true" :aria-labelledby="`${id}-title`"
            class="app-modal fixed inset-0 z-50 hidden w-full overflow-y-auto">
            <div class="app-modal-panel app-modal-small">
                <header class="app-modal-header">
                    <span class="app-modal-eyebrow">Confirmação</span>
                    <h2 :id="`${id}-title`">Remover</h2>
                </header>
                <div class="app-modal-body"><slot /></div>
                <div class="app-modal-footer">
                    <button type="button" @click="visible = false" class="app-modal-button">Cancelar</button>
                    <button type="button" @click="confirm" class="app-modal-button app-modal-danger">Sim</button>
                </div>
            </div>
        </div>
    </teleport>
</template>
