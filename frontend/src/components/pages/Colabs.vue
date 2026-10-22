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

        <EasyDataTable class="my-4" show-index id="tabela" :headers="headers" :items="colabs"
            v-model:items-selected="itemsSelected" rowsPerPageMessage="linhas por página:"
            rowsOfPageSeparatorMessage="de" emptyMessage="Não há dados disponíveis" :buttons-pagination=true
            :search-value="searchValue" alternating>

            <!--v-model:items-selected="itemsSelected"-->

            <template #item-operation="colab">
                <div class="operation-wrapper">
                    <img src="../../assets/delete.png" class="operation-icon" data-bs-toggle="modal"
                        data-bs-target="#exampleModal" @click="modal(colab)" />
                </div>
            </template>
        </EasyDataTable>

        <!--***** Modal ********-->
        <div class="modal fade" id="exampleModal" tabindex="-1" aria-labelledby="exampleModalLabel" >
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">

                        <img id="svg" src="../../assets/triangule.svg" alt="">

                        <h1 class="modal-title fs-5" id="exampleModalLabel">Remover</h1>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        Remover profissional: <b>{{ colab }}</b> ?
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal"
                            @click="deleteItem(colab)">Sim</button>
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
        <!--***** /Modal ********-->
    </div>
</template>

<script>
import axios from 'axios'
import Vue3EasyDataTable from 'vue3-easy-data-table'
import 'vue3-easy-data-table/dist/style.css'

import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'

export default {
    data() {
        return {
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
            searchValue: "",
        }
    },
    components: {
        'EasyDataTable': Vue3EasyDataTable,
        toast
    },
    methods: {
        notify() {
            toast.success("Profissional removido.", {
                autoClose: 1000,
                theme: 'colored',
            })
        },
        loadColabs() {
            axios.get("colab")
                .then(res => {
                    this.colabs = res.data
                }).catch("Erro")
        },
        loadColab(colab) {
            this.colab = { ...colab }
            console.log("colab: " + this.colab)
        },
        modal(colab) {
            this.lColab = { ...colab }
            this.colab = this.lColab.colab
            this.colabId = this.lColab.id
        },
        deleteItem() {

            this.colabs = this.colabs.filter((item) => item.id !== this.colabId);

            axios.delete(`colab/${this.colabId}`)
                .then(() => {
                    this.notify()
                })
                .catch("Erro")
        },
    },
    mounted() {
        this.loadColabs()
    }
}
</script>


<style lang="scss" scoped>
#svg {
    width: 40px;
    margin-right: 20px;
    color: orange;
}

.operation-wrapper .operation-icon {
    width: 20px;
    cursor: pointer;
}
</style>