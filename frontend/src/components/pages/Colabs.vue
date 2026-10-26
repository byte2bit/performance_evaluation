<template>
  <ManagementPage title="Lista de profissionais" description="Consulte os profissionais, suas áreas de atuação e os responsáveis.">
    <template #actions><router-link v-if="identity.admin" to="/inserir" class="mp-button mp-button-primary"><span aria-hidden="true">+</span> Inserir profissional</router-link></template>
    <section class="mp-card" aria-label="Lista de profissionais">
      <div class="mp-toolbar">
        <div class="mp-search">
          <label for="busca-colabs">Buscar profissionais</label>
          <div class="mp-search-control"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
            <input id="busca-colabs" class="mp-input" type="search" v-model="searchValue"
              placeholder="Nome, serviço, função ou demandante…" aria-describedby="ajuda-colabs" />
          </div>
          <p id="ajuda-colabs">A busca considera todos os campos da tabela.</p>
        </div>
        <span class="mp-count">Total: <strong>{{ colabs.length }}</strong></span>
      </div>
      <EasyDataTable class="mp-data-table" theme-color="#1d4ed8" show-index id="tabela" :headers="visibleHeaders" :items="colabs"
        v-model:items-selected="itemsSelected" rowsPerPageMessage="linhas por página:" rowsOfPageSeparatorMessage="de"
        emptyMessage="Não há dados disponíveis" :buttons-pagination="true" :search-value="searchValue" alternating>
        <template #item-colab="item"><span class="mp-person">{{ item.colab }}</span></template>
        <template #item-operation="colab">
          <button v-if="identity.admin" type="button" class="mp-delete" :aria-label="`Remover profissional ${colab.colab}`"
            aria-haspopup="dialog" aria-controls="delete-colab-modal" @click="modal(colab)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg>
          </button>
        </template>
      </EasyDataTable>
      <p class="mp-table-note">Deslize a tabela para consultar todos os dados dos profissionais.</p>
    </section>
    <ConfirmDeleteModal v-if="identity.admin" id="delete-colab-modal" v-model="showDelete" @confirm="deleteItem">
      Remover profissional: <b>{{ colab }}</b> ?
    </ConfirmDeleteModal>
  </ManagementPage>
</template>

<script>
import ManagementPage from "@/components/utils/ManagementPage.vue";
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
                { text: "Profissional", value: "colab", sortable: true, width: 200 },
                { text: "PPU", value: "ppu", sortable: true },
                { text: "Serviço", value: "servico", sortable: true },
                { text: "Função", value: "funcao", sortable: true },
                { text: "Lideranças", value: "liderancas", sortable: true },
                { text: "Gerência", value: "gerencia", sortable: true },
                { text: "Demandante", value: "demandante", sortable: true },
                { text: "Remover", value: "operation" },

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
        ManagementPage,
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
