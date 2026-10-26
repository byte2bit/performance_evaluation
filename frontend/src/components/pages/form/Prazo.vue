<template>

    <div class="evaluation-criterion mp-card">
        <div class="evaluation-criterion-heading"><span aria-hidden="true">02</span><h3>Prazo</h3></div>
        <div class="star-title">
            <p>Com relação ao atendimento no prazo das solicitações
                efetuadas ao Posto de Serviço, qual seu nível de satisfação?</p>
        </div>
        <div>
            <star-rating v-model:rating="postData.nota_prazo" :increment="0.5" active-border-color="var(--mp-accent, #1d4ed8)"
                active-color="var(--mp-accent, #1d4ed8)" :star-size="25" />
            <div class="my-3 flex flex-col">
                <label for="obs_prazo">Observações:</label>
                <textarea class="min-w-0 w-full" v-sanitize="text" id="obs_prazo" rows="3" v-model="postData.obs_prazo"></textarea>
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
