<template>
    <div class="tb">
        <div class="d-flex justify-content-between align-items-center">
            <h2 class="my-5">Lista de profissionais: </h2>
            <router-link to="/" class="h5">Voltar</router-link>
        </div>

        <div class="bg-dark bg-opacity-10 p-2 rounded ps-3">    
            <span class="me-2"><b>Procurar: </b> </span>
            <input class="w-25" type="text" v-model="searchValue">
        </div>

        <EasyDataTable class="my-4" show-index id="tabela" :headers="visibleHeaders" :items="colabs"
            v-model:items-selected="itemsSelected" rowsPerPageMessage="linhas por página:"
            rowsOfPageSeparatorMessage="de" emptyMessage="Não há dados disponíveis" :buttons-pagination=true
            :search-value="searchValue" alternating>

            <!--v-model:items-selected="itemsSelected"-->

            <template #item-operation="colab">
                <div v-if="identity.admin" class="operation-wrapper">
                    <button type="button" :aria-label="`Remover profissional ${colab.colab}`"
                        aria-haspopup="dialog" aria-controls="delete-colab-modal" @click="modal(colab)">
                        <img src="../../assets/delete.png" class="operation-icon" alt="" />
                    </button>
                </div>
            </template>
        </EasyDataTable>

        <ConfirmDeleteModal v-if="identity.admin" id="delete-colab-modal" v-model="showDelete" @confirm="deleteItem">
            Remover profissional: <b>{{ colab }}</b> ?
        </ConfirmDeleteModal>
    </div>
</template>

<script>
import axios from '@/plugins/axios.js'
import ConfirmDeleteModal from '@/components/utils/ConfirmDeleteModal.vue'
import Vue3EasyDataTable from 'vue3-easy-data-table'
import 'vue3-easy-data-table/dist/style.css'

import { toast } from 'vue3-toastify'
import { dados } from '@/js/store.js'
import 'vue3-toastify/dist/index.css'

export default {
    data() {
        return {
            identity: dados,
            headers: [
                { text: "Remover", value: "operation" },
                { text: "Profissional", value: "colab", sortable: true, width: 200 },
                { text: "PPU", value: "ppu", sortable: true },
                { text: "Serviço", value: "servico", sortable: true },
                { text: "Função", value: "funcao", sortable: true },
                { text: "Lideranças", value: "liderancas", sortable: true },
                { text: "Gerência", value: "gerencia", sortable: true },
                { text: "Demandante", value: "demandante", sortable: true },

            ],
            items: [],
            colabs: [],
            colab: {},
            itemsSelected: [],
            colabId: "",
            showDelete: false,
            searchValue: "",
        }
    },
    components: {
        'EasyDataTable': Vue3EasyDataTable,
        ConfirmDeleteModal,
        toast
    },
    computed: {
        visibleHeaders() { return this.identity.admin ? this.headers : this.headers.filter(header => header.value !== 'operation') }
    },
    methods: {
        notify() {
            toast.success("Profissional removido.", {
                autoClose: 1000,
                theme: 'colored',
            })
        },
        loadColabs() {
            return axios.get('/colab')
                .then(res => {
                    this.colabs = res.data
                }).catch(() => {
                    toast.error('Não foi possível carregar os profissionais.', { theme: 'colored' })
                })
        },
        loadColab(colab) {
            this.colab = { ...colab }
        },
        modal(colab) {
            this.lColab = { ...colab }
            this.colab = this.lColab.colab
            this.colabId = this.lColab.id
            this.showDelete = true
        },
        deleteItem() {

            const colabId = this.colabId

            return axios.delete(`/colab/${colabId}`)
                .then(() => {
                    this.colabs = this.colabs.filter(item => item.id !== colabId)
                    this.notify()
                })
                .catch(() => {
                    toast.error('Não foi possível remover o profissional.', { theme: 'colored' })
                })
        },
    },
    mounted() {
        this.loadColabs()
    }
}
</script>


<style lang="scss" scoped>
.operation-wrapper .operation-icon {
    width: 20px;
    cursor: pointer;
}
</style>
