<template>

    <div class="flex flex-col w-full md:w-1/4 p-4 bg-zinc-200 rounded-md">
        <div class="star-title">
            <p>Com relação ao atendimento no prazo das solicitações
                efetuadas ao Posto de Serviço, qual seu nível de satisfação?</p>
        </div>
        <div>
            <star-rating v-model:rating="postData.nota_prazo" :increment="0.5" active-border-color="#1a00ab"
                active-color="#1a00ab" :star-size="25" />
            <div class="my-3 flex flex-col">
                <label for="obs_prazo">Observações:</label>
                <textarea v-sanitize="text" id="obs_prazo" rows="3" v-model="postData.obs_prazo"></textarea>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue'
import StarRating from 'vue-star-rating'

const postData = defineModel('postData')
const text = ref("")

</script>

<style lang="scss" scoped>

</style>