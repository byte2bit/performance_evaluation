<script setup>
import Respon from './form/Respon.vue'
import Dispon from './form/Dispon.vue'
import Qualidade from './form/Qualidade.vue'
import Prazo from './form/Prazo.vue'

import ChecksModal from '../utils/ChecksModal.vue'
import { ref, reactive, computed } from 'vue'
import { storeToRefs } from 'pinia'

import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'
import "vue3-select-component/dist/style.css"

// import { dados } from '@/js/store.js'

import Loading from 'vue-loading-overlay';
import 'vue-loading-overlay/dist/css/index.css';

// Importando o store de colaboradores
import { useColabStore } from '@/stores/colabStore'

const colabStore = useColabStore()

//colabs selecionados, vindo do store
const { chkColabs, selectedColabs } = storeToRefs(colabStore)

// console.log('Colaboradores selecionados:', chkColabs)

const showReview = ref(false)
const isLoading = ref(false)
const fullPage = ref(true)

const postData = reactive({
    desconto: "",
    nivel: "",
    avaliacao: "",
    nota_qualidade: 5,
    obs_qualidade: "",
    nota_prazo: 5,
    obs_prazo: "",
    nota_dispon: 5,
    obs_dispon: "",
    nota_respon: 5,
    obs_respon: "",
    colab: '',
    demandante: '',
    itensQualidade: [],
    itensDispon: [],
    liderancas: '',
})

const iQualidade = computed({
    get: () => postData.itensQualidade,
    set: value => { postData.itensQualidade = value }
})
const iDispon = computed({
    get: () => postData.itensDispon,
    set: value => { postData.itensDispon = value }
})

const optQualidade = [
    { name: "Comportamento/Atitude: O profissional não demonstra comportamento adequado ou atitude positiva no atendimento.", id: 1 },
    { name: "Forma de comunicação (Verbal/escrita, cordialidade): Falhas na comunicação, falta de cordialidade ou erros na comunicação escrita. ", id: 2 },
    { name: "Habilidade no uso de sistemas informatizados e soluções tecnológicas no suporte: Dificuldades ou falhas no uso de sistemas e tecnologias. ", id: 3 },
    { name: "Apoio a reuniões e eventos: Falta de suporte adequado ou problemas durante reuniões e eventos. ", id: 4 },
    { name: "Atendimento a demandas: Demora ou falhas no atendimento das solicitações.", id: 5 },
    { name: "Falta de conhecimentos básicos para as tarefas: Falta de domínio sobre as tarefas básicas relacionadas ao posto de serviço.", id: 6 },
    { name: "Insuficiência de conhecimento, especialização ou experiência técnica necessária para o posto de serviço: Falta de conhecimento técnico, especialização ou experiência necessária.", id: 7 },
]

const optDispon = [
    { name: "Posto indisponível por um dia ou mais.", id: 1 },
    { name: "Frequência de atraso, indisponível no horário administrativo.", id: 2 },
    { name: "O posto de Serviço estava indisponível em horário previsto para compromisso agendado da gerência.", id: 3 },
]

function notify() {
    toast.success("Aguarde, enviando dados...", {
        autoClose: 3000,
        theme: 'colored',
    })
}

function notifyProf() {
    toast.warning("Selecione um profissional", {
        autoClose: 1000,
        theme: 'colored',
    })
}

const avaliacao = computed(() => {
    return (Number(postData.nota_qualidade) +
        Number(postData.nota_prazo) +
        Number(postData.nota_dispon) +
        Number(postData.nota_respon)) / 4
})

const pontos = computed(() => {
    const x = avaliacao.value
    if (x <= 5 && x >= 4.5) return 0
    if (x <= 4.4 && x >= 4) return 1
    if (x <= 3.9 && x >= 3.5) return 5
    if (x <= 3.4 && x >= 2.5) return 7
    if (x <= 2.4 && x >= 1) return 10
    return 0
})
const nivel = computed(() => {
    const p = pontos.value
    if (p === 0) return "A"
    if (p === 1) return "B"
    if (p === 5) return "C"
    if (p === 7) return "D"
    if (p === 10) return "E"
    return ""
})

const desc = computed(() => {
    const p = pontos.value

    if (p === 0) return "0%"
    if (p === 1) return "1%"
    if (p === 5) return "2%"
    if (p === 7) return "3%"
    if (p === 10) return "5%"
    return ""
})

const submitState = reactive({
    isLoading: false,
    error: null,
    success: false
})

function validatePostData() {
    const errors = []

    if (selectedColabs.value.length === 0) {
        errors.push('Selecione pelo menos um colaborador')
    }

    if (postData.nota_qualidade <= 3 && iQualidade.value.length === 0) {
        errors.push('Marque os itens de qualidade não atendidos')
    }

    if (postData.nota_dispon <= 3 && iDispon.value.length === 0) {
        errors.push('Marque os itens de disponibilidade não atendidos')
    }

    return errors
}

/* const save = async () => {
    submitState.isLoading = true
    submitState.error = null

    try {
        const validationErrors = validatePostData()
        if (validationErrors.length > 0) {
            throw new Error(validationErrors.join(', '))
        }

        await axios.all([
            axios.post("registros", postData),
            axios.post("mail", postData)
        ])

        submitState.success = true
        reset()
    } catch (error) {
        submitState.error = error.message
        toast.error(error.message, { theme: 'colored' })
        console.error('Save error:', error)
    } finally {
        submitState.isLoading = false
    }
} */
/* const toggleSimpleModal = computed(() => {
    if (postData.nota_qualidade <= 3) {
        smFlag = true
    }
    return smFlag
}) */

function reset() {
    Object.assign(postData, {
        desconto: "",
        nivel: "",
        avaliacao: "",
        nota_qualidade: 5,
        obs_qualidade: "",
        nota_prazo: 5,
        obs_prazo: "",
        nota_dispon: 5,
        obs_dispon: "",
        nota_respon: 5,
        obs_respon: "",
        colab: '',
        demandante: '',
        itensQualidade: [],
        itensDispon: [],
        liderancas: '',
    })

    colabStore.clearSelection()
    showReview.value = false
}
</script>

<template>
    <div class="evaluation-workspace">

        <section aria-label="Formulário de avaliação">
            <div class="evaluation-notice" id="inf-importante">
                <h2>Informações importantes</h2>

                <p>A avaliação resultante influenciará a avaliação geral do desempenho do POSTO DE SERVIÇO, podendo
                    afetar a medição total devido à baixa qualidade, performance, produtividade, atrasos ou falhas nos
                    serviços
                    prestados. Baixo desempenho pode resultará em desconto na medição mensal como penalização pelos
                    serviços insatisfatórios, conforme avaliação das áreas clientes.</p>
            </div>
            <form class="form vl-parent evaluation-form" @submit.prevent="">
                <!-- <form class="form vl-parent" @submit.prevent="save"> -->

                <loading v-model:active="isLoading" :can-cancel="true" :is-full-page="fullPage" />

                <div class="evaluation-results" role="group" aria-label="Resultado calculado">
                    <div class="inputs">
                        <label for="media">Avaliação Média:</label>
                        <input type="text" id="media" :value="avaliacao" disabled />
                    </div>
                    <div class="inputs">
                        <label for="nivel">Nível de Serviço:</label>
                        <input type="text" id="nivel" :value="nivel" disabled />
                    </div>
                    <div class="inputs">
                        <label for="desconto">Desconto Percentual na Medição:</label>
                        <input type="text" id="desconto" :value="desc" disabled />
                    </div>
                </div>

                <!-- Perguntas com estrelas -->
                <div class="evaluation-criteria-heading">
                    <span class="mp-eyebrow">02 · Avaliação</span>
                    <h2>Critérios de avaliação</h2>
                    <p>Atribua as notas e registre suas observações.</p>
                </div>
                <div class="evaluation-criteria-grid">

                    <Qualidade :postData="postData" v-model:iQualidade="iQualidade" :optQualidade="optQualidade" />

                    <Prazo :postData="postData" />

                    <Dispon :postData="postData" v-model:iDispon="iDispon" :optDispon="optDispon" />

                    <Respon :postData="postData" />
                </div>
                <!-- Final Perguntas com estrelas -->

                <div class="evaluation-actions">

                    <!-- Modal toggle -->
                    <button @click="showReview = true" aria-haspopup="dialog"
                        aria-controls="default-modal" :aria-expanded="showReview"
                        class="mp-button mp-button-secondary"
                        type="button">
                        Resumo
                    </button>

                    <button id="submit" type="submit"
                        class="mp-button mp-button-primary">
                        Submeter Avaliação
                    </button>
                </div>

                <ChecksModal id="default-modal" v-model="showReview">
                    <template #bodyModal>
                        <div class="modal-dados flex flex-col gap-6 md:flex-row">

                            <div class="flex flex-col">

                                <h2 class="mb-4 font-bold">Colaborador(es) selecionado(s): </h2>

                                <div class="flex flex-col flex-wrap md:max-h-150 md:max-w-230 overflow-auto me-12">
                                    <ul class="text-sm" v-for="(colab, index) in selectedColabs" :key="colab.id">
                                        <li class="me-4">
                                            {{ index + 1 + ' - ' + colab.colab }}
                                            <span v-if="colabStore.selectionDetails(colab)">
                                                ({{ colabStore.selectionDetails(colab) }})
                                            </span>
                                        </li>
                                    </ul>
                                </div>
                            </div>

                            <div id="dados">
                                <h2 class="mb-4 font-bold">Dados avaliados: </h2>
                                <!-- <p>Colaborador: {{ chkColabs.join(', ') }}</p> -->
                                <p>Avaliação Média: {{ avaliacao }}</p>
                                <p>Nível de Serviço: {{ nivel }}</p>
                                <p>Desconto Percentual na Medição: {{ desc }}</p>
                                <p>Observações de Qualidade: {{ postData.obs_qualidade }}</p>
                                <p>Observações de Prazo: {{ postData.obs_prazo }}</p>
                                <p>Observações de Disponibilidade: {{ postData.obs_dispon }}</p>
                                <p>Observações de Responsabilidade: {{ postData.obs_respon }}</p>
                            </div>
                        </div>
                    </template>
                </ChecksModal>

            </form>
        </section>
    </div>
</template>


<style lang="scss" scoped>
.modal-dados p,
.modal-dados ul li {
    font-size: 12px;
}

#dados p {
    font-size: 1rem;
}

.main {
    background-color: #fff;
}

h5 {
    font-size: 12px;
    text-align: center;
}

.form {
    min-width: 0;
}


.inputs {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    label {
        margin-bottom: 5px;
    }
}
</style>
