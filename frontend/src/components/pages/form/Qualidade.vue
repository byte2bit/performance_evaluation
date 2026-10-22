<template>
    <div class="flex flex-col w-full md:w-1/4 p-4 bg-zinc-200 rounded-md">
        <div class="star-title">
            <p>Como você avalia a qualidade do Serviço
                Prestado?</p>
        </div>
        <div>
            <star-rating v-model:rating="postData.nota_qualidade" :increment="0.5" active-border-color="#1a00ab"
                active-color="#1a00ab" :star-size="25" data-modal-show="sub-modal" data-modal-target="sub-modal" />
            <div class="my-3 flex flex-col">
                <label for="obs_qualidade">Observações:</label>
                <textarea v-sanitize="text" id="obs_qualidade" rows="3" v-model="postData.obs_qualidade"></textarea>
            </div>
        </div>

        <SubModal v-model="showSubModal">
            <template #headerModal>
                <div class="px-3 px-sm-5 text-center">
                    <h3 class="font-bold mb-2">Qualidade de serviço:</h3>
                    <h4 class="font-bold">Marque os itens que não foram atendidos</h4>
                    <p>(obrigatório caso a nota seja menor ou igual 3)</p>
                </div>
            </template>

            <template #bodyModal>
                <div class="flex flex-col">
                    <div class="form-check d-flex align-items-start mt-3" v-for="option in optQualidade" :key="option.id">
                        <input type="checkbox" :value="option.name" :id="`check-dispon-${option.id}`"
                            v-model="iQualidade" />
                        <label :for="`check-dispon-${option.id}`">{{ option.name }}</label>
                    </div>
                </div>
            </template>
        </SubModal>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import SubModal from '@/components/utils/SubModal.vue'
import StarRating from 'vue-star-rating'

const optQualidade = defineModel('optQualidade')
const postData = defineModel('postData')
const iQualidade = defineModel('iQualidade')
const text = ref("")
const showSubModal = ref(false)

// Abre ou fecha o modal automaticamente ao mudar a nota
watch(() => postData.nota_qualidade, (newVal) => {
    if (newVal <= 3) {
        showSubModal.value = true
    } else {
        showSubModal.value = false
        iQualidade.value = []
    }
})

</script>

<style lang="scss" scoped>

</style>