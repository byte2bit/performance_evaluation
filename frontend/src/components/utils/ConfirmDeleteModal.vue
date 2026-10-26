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
            class="fixed inset-0 z-50 hidden w-full overflow-y-auto p-4">
            <div class="relative w-full max-w-md rounded-lg bg-white p-6 shadow-sm">
                <h2 :id="`${id}-title`" class="mb-4 text-xl font-semibold text-gray-900">Remover</h2>
                <div class="mb-6 break-words text-gray-800"><slot /></div>
                <div class="flex justify-end gap-3">
                    <button type="button" @click="visible = false"
                        class="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm text-gray-900 hover:bg-gray-100 focus:ring-4 focus:ring-gray-200">Cancelar</button>
                    <button type="button" @click="confirm"
                        class="rounded-lg bg-blue-700 px-5 py-2.5 text-sm text-white hover:bg-blue-800 focus:ring-4 focus:ring-blue-300">Sim</button>
                </div>
            </div>
        </div>
    </teleport>
</template>
