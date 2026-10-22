<template>
    <teleport to="body">
        <!-- Main modal -->
        <div id="sub-modal" tabindex="-1"
            class="hidden fixed top-0 left-0 right-0 z-50 w-full p-4 overflow-x-hidden overflow-y-auto md:inset-0 h-[calc(100%-1rem)] max-h-full">
            <div class="relative w-full max-w-xl max-h-full">
                <!-- Modal content -->
                <div class="relative bg-white rounded-lg shadow-sm">
                    <!-- Modal header -->
                    <div
                        class="flex items-center justify-center p-4 md:p-5 border-b rounded-t border-gray-200 bg-gray-300">
                        <h3 class="text-xl font-semibold text-gray-900">
                            <slot name="headerModal">Título</slot>
                        </h3>
                    </div>
                    <!-- Modal body -->
                    <div class="p-4 md:p-5 space-y-4">
                        <slot name="bodyModal">Conteúdo do Modal</slot>
                    </div>

                    <!-- Modal footer -->
                    <div class="flex items-center justify-end p-4 md:p-5 border-t border-gray-200 rounded-b">
                        <button data-modal-hide="sub-modal" type="button"
                            class="py-2.5 px-5 ms-3 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100"
                            @click="closeModal">OK</button>
                    </div>
                </div>
            </div>
        </div>
    </teleport>
</template>

<script setup>
import { useColabStore } from '@/stores/colabStore'
import { Modal } from 'flowbite'

const colabStore = useColabStore()


// Use defineModel for v-model binding
const simpleModalFlag = defineModel('simpleModalFlag');

const closeModal = () => {
    const modal = new Modal(document.getElementById('sub-modal'))
    modal.hide()
    // Modifying the defineModel variable automatically emits the update event
    // simpleModalFlag.value = false
    // smFlag = false
};

</script>

<style lang="scss" scoped></style>