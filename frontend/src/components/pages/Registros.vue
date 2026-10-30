<template>
  <ManagementPage title="Registros" description="Consulte o histórico de avaliações e encontre os resultados que precisa.">
    <template #actions><Excel /></template>
    <section class="mp-card" aria-label="Registros">
      <div class="mp-toolbar">
        <div class="mp-search">
          <label for="busca-registros">Buscar registros</label>
          <div class="mp-search-control"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
            <input id="busca-registros" class="mp-input" type="search" v-model="searchValue"
              placeholder="Nome, data, nota ou avaliador…" aria-describedby="ajuda-registros" />
          </div>
          <p id="ajuda-registros">A busca considera todos os campos da tabela.</p>
        </div>
        <span class="mp-count">Exibindo: <strong>{{ filteredRecords.length }}</strong> de {{ colabcUser.length }}</span>
      </div>
      <div class="mp-period" role="group" aria-label="Pesquisar por período">
        <label for="registros-inicio">Data inicial<input id="registros-inicio" class="mp-input" type="date" v-model="startDate" :aria-invalid="Boolean(dateError)" aria-describedby="registros-periodo-ajuda" /></label>
        <label for="registros-fim">Data final<input id="registros-fim" class="mp-input" type="date" v-model="endDate" :aria-invalid="Boolean(dateError)" aria-describedby="registros-periodo-ajuda" /></label>
        <button type="button" class="mp-button mp-button-secondary" @click="clearFilters">Limpar filtros</button>
      </div>
      <p id="registros-periodo-ajuda" class="mp-period-hint" :class="{ 'mp-period-error': dateError }" :role="dateError ? 'alert' : undefined">{{ dateError || 'O período inclui as duas datas e considera a data de gravação da avaliação.' }}</p>
      <p v-if="loading" class="mp-record-status" role="status">Carregando registros…</p>
      <div v-if="loadError" class="mp-record-status" role="alert">{{ loadError }} <button type="button" class="mp-history-link" @click="loadRegs()">Tentar novamente</button></div>
      <EasyDataTable class="mp-data-table mp-records-table" theme-color="#1d4ed8" show-index id="tabela" :headers="visibleHeaders" :items="filteredRecords"
         rowsPerPageMessage="linhas por página:" rowsOfPageSeparatorMessage="de"
        :empty-message="loading ? 'Carregando registros…' : dateError ? 'Corrija o período informado.' : colabcUser.length ? 'Nenhuma avaliação encontrada para os filtros informados.' : 'Não há dados disponíveis'" :buttons-pagination="true" alternating>
        <template #item-colab="item">
          <button v-if="hasProfessionalId(item)" type="button" class="mp-person mp-history-link" aria-haspopup="dialog" aria-controls="professional-history-modal" :aria-label="`Consultar avaliações de ${item.colab}, profissional ${item.colab_id}`" @click="openHistory(item)">{{ item.colab }}</button>
          <span v-else class="mp-person">{{ item.colab }}<span class="mp-unlinked">Sem vínculo por ID</span></span>
        </template>
        <template #item-created_at="item">{{ formatRecordDate(item.created_at) }}</template>
        <template #item-operation="registro">
          <button v-if="dados.admin" type="button" class="mp-delete" :aria-label="`Remover registro de ${registro.colab}`"
            aria-haspopup="dialog" aria-controls="delete-registro-modal" @click="modal(registro)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg>
          </button>
        </template>
      </EasyDataTable>
      <p class="mp-table-note">Clique no nome do profissional para consultar seu histórico completo.<span v-if="dados.admin"> A exportação XLS inclui todo o histórico autorizado.</span></p>
    </section>
    <ConfirmDeleteModal v-if="dados.admin" id="delete-registro-modal" v-model="showDelete" @confirm="deleteItem">
      Remover registro de: <b>{{ registro }}</b> ?
    </ConfirmDeleteModal>
    <ProfessionalHistoryModal v-model="showHistory" :professional-name="historyName" :professional-id="historyId"
      :records="historyRecords" :loading="historyLoading" :error="historyError" @retry="refreshHistory" />
  </ManagementPage>
</template>

<script>
import ManagementPage from "@/components/utils/ManagementPage.vue";
import axios from "@/plugins/axios.js";
import ConfirmDeleteModal from "@/components/utils/ConfirmDeleteModal.vue";
import ProfessionalHistoryModal from "@/components/utils/ProfessionalHistoryModal.vue";
import { filterRecords, formatRecordDate, periodError } from "@/components/utils/record-history.js";
import "@/styles/record-history.css";
import Vue3EasyDataTable from "vue3-easy-data-table";
import "vue3-easy-data-table/dist/style.css";

import { dados } from "../../js/store.js";

import { toast } from "vue3-toastify";
import "vue3-toastify/dist/index.css";

import Excel from "./Excel.vue";

export default {
  data() {
    return {
      dados,
      colabcUser: [],
      items: [],
      registros: [],
      registro: {},
      itemsSelected: [],
      regId: "",
      showDelete: false,
      searchValue: "",
      startDate: "",
      endDate: "",
      loading: false,
      loadError: "",
      disposed: false,
      loadGeneration: 0,
      showHistory: false,
      historyId: null,
      historyName: "",
      historyLoading: false,
      historyError: "",
      historyGeneration: 0,
      headers: [
        { text: "Profissional", value: "colab", sortable: true, width: 200 },
        { text: "Data Aval.", value: "created_at", sortable: true },
        { text: "Avaliação", value: "avaliacao", sortable: true },
        { text: "Nível", value: "nivel", sortable: true },
        { text: "Desc (%)", value: "desconto", sortable: true },
        { text: "Nota Qld", value: "nota_qualidade", sortable: true },
        { text: "Obs Qld", value: "obs_qualidade", width: 180, sortable: true },
        { text: "Nota Prazo", value: "nota_prazo", sortable: true },
        { text: "Obs. Prazo", value: "obs_prazo", width: 180, sortable: true },
        { text: "Nota Disp.", value: "nota_dispon", sortable: true },
        { text: "Obs. Disp.", value: "obs_dispon", width: 180, sortable: true },
        { text: "Nota Rsp.", value: "nota_respon", sortable: true },
        { text: "Obs. Rsp.", value: "obs_respon", width: 180, sortable: true },
        { text: "Itens Qld", value: "itensQualidade", width: 180, sortable: true },
        { text: "Itens Disp.", value: "itensDispon", width: 180, sortable: true },
        { text: "Liderança", value: "liderancas", sortable: true },
        { text: "Avaliador original", value: "demandante", sortable: true, width: 100 },
        { text: "Remover", value: "operation" },
      ],
    };
  },
  components: {
    ManagementPage,
    EasyDataTable: Vue3EasyDataTable,
    ConfirmDeleteModal,
    ProfessionalHistoryModal,
    toast,
    dados,
    Excel,
  },
  computed: {
    visibleHeaders() { return this.dados.admin ? this.headers : this.headers.filter(header => header.value !== 'operation'); },
    dateError() { return periodError(this.startDate, this.endDate); },
    filteredRecords() { return filterRecords(this.colabcUser, this.startDate, this.endDate, this.searchValue, this.visibleHeaders.filter(header => header.value !== 'operation').map(header => header.value)); },
    historyRecords() { return this.historyError || this.historyLoading ? [] : this.registros.filter(record => this.hasProfessionalId(record) && Number(record.colab_id) === Number(this.historyId)); },
  },
  methods: {
    notify() {
      toast.success("Registro removido.", {
        autoClose: 1000,
        theme: "colored",
      });
    },
    formatRecordDate,
    hasProfessionalId(record) { return /^\d+$/.test(String(record.colab_id)) && Number.isSafeInteger(Number(record.colab_id)) && Number(record.colab_id) > 0; },
    clearFilters() { this.startDate = ''; this.endDate = ''; this.searchValue = ''; },
    async loadRegs() {
      const generation = ++this.loadGeneration;
      this.loading = true;
      this.loadError = '';
      try {
        const { data } = await axios.get('/registros');
        if (this.disposed || generation !== this.loadGeneration) return false;
        this.registros = data;
        this.colabcUser = data;
        return true;
      } catch {
        if (!this.disposed && generation === this.loadGeneration) {
          this.loadError = 'Não foi possível carregar os registros.';
          toast.error(this.loadError, { theme: 'colored' });
        }
        return false;
      } finally { if (!this.disposed && generation === this.loadGeneration) this.loading = false; }
    },
    openHistory(record) {
      if (!this.hasProfessionalId(record)) return;
      this.historyId = Number(record.colab_id);
      this.historyName = record.colab;
      this.showHistory = true;
      return this.refreshHistory();
    },
    async refreshHistory() {
      const generation = ++this.historyGeneration;
      this.historyLoading = true;
      this.historyError = '';
      // Reauthorize a fresh read before opening the detailed history.
      const loaded = await this.loadRegs();
      if (this.disposed || generation !== this.historyGeneration) return;
      this.historyLoading = false;
      if (!loaded) this.historyError = 'Não foi possível atualizar o histórico. Tente novamente.';
    },
    loadReg(registro) {
      this.registro = { ...registro };
      // console.log("registro: " + this.registro)
    },
    modal(registro) {
      this.lReg = { ...registro };
      this.registro = this.lReg.colab;
      this.regId = this.lReg.id;
      this.showDelete = true;
    },
    deleteItem() {
      // console.log("lReg: " + JSON.stringify(this.lReg))

      const regId = this.regId;

      return axios
        .delete(`/registros/${regId}`)
        .then(() => {
          this.registros = this.registros.filter(item => item.id !== regId);
          this.colabcUser = this.colabcUser.filter(item => item.id !== regId);
          this.notify();
        })
        .catch(() => {
          toast.error('Não foi possível remover o registro.', { theme: 'colored' });
        });
    },
  },
  mounted() {
    this.loadRegs();
  },
  beforeUnmount() { this.disposed = true; this.loadGeneration++; this.historyGeneration++; },
};
</script>
