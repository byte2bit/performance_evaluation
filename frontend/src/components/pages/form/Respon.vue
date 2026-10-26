<template>

    <div class="flex flex-col min-w-0 w-full p-4 bg-zinc-200 rounded-md">
        <div class="star-title">
            <p>Com relação a responsabilidade de profissionais atendendo
                ao posto de serviço, qual seu nível de satisfação?</p>
        </div>
        <div>
            <star-rating v-model:rating="postData.nota_respon" :increment="0.5" active-border-color="#1a00ab"
                active-color="#1a00ab" :star-size="25" />

            <div class="my-3 flex flex-col">
                <label for="obs_respon">Observações:</label>
                <textarea class="min-w-0 w-full" v-sanitize="text" id="obs_respon" rows="3" v-model="postData.obs_respon"></textarea>
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
