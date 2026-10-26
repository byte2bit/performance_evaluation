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
        <span class="mp-count">Total: <strong>{{ colabcUser.length }}</strong></span>
      </div>
      <EasyDataTable class="mp-data-table mp-records-table" theme-color="#1d4ed8" show-index id="tabela" :headers="visibleHeaders" :items="colabcUser"
         rowsPerPageMessage="linhas por página:" rowsOfPageSeparatorMessage="de"
        emptyMessage="Não há dados disponíveis" :buttons-pagination="true" :search-value="searchValue" alternating>
        <template #item-colab="item"><span class="mp-person">{{ item.colab }}</span></template>
        <template #item-operation="registro">
          <button v-if="dados.admin" type="button" class="mp-delete" :aria-label="`Remover registro de ${registro.colab}`"
            aria-haspopup="dialog" aria-controls="delete-registro-modal" @click="modal(registro)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg>
          </button>
        </template>
      </EasyDataTable>
      <p class="mp-table-note">Deslize a tabela para consultar todas as notas e observações.</p>
    </section>
    <ConfirmDeleteModal v-if="dados.admin" id="delete-registro-modal" v-model="showDelete" @confirm="deleteItem">
      Remover registro de: <b>{{ registro }}</b> ?
    </ConfirmDeleteModal>
  </ManagementPage>
</template>

<script>
import ManagementPage from "@/components/utils/ManagementPage.vue";
import axios from "@/plugins/axios.js";
import ConfirmDeleteModal from "@/components/utils/ConfirmDeleteModal.vue";
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
    toast,
    dados,
    Excel,
  },
  computed: {
    visibleHeaders() { return this.dados.admin ? this.headers : this.headers.filter(header => header.value !== 'operation'); },
  },
  methods: {
    notify() {
      toast.success("Registro removido.", {
        autoClose: 1000,
        theme: "colored",
      });
    },
    loadRegs() {
      return axios
        .get("/registros")
        .then((res) => {
          this.registros = res.data;

          this.admin = dados.admin;

          // The API authorizes by the professional's current owner. The author
          // snapshot may belong to a previous owner or an administrator.
          this.colabcUser = this.registros;

          //converte data
          var data = this.registros.map((registro) => {
            let a = registro.created_at.split("T")[0];
            let d = a.split("-");
            let dat = d[2] + "/" + d[1] + "/" + d[0];
            registro.created_at = dat;
            return registro.created_at;
          });
        })
        .catch(() => {
          toast.error('Não foi possível carregar os registros.', { theme: 'colored' });
        });
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
};
</script>
