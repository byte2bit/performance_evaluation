<template>
  <div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center">
      <h2 class="my-5">Registros:</h2>
      <router-link to="/" class="h5">Voltar</router-link>
    </div>

    <div class="bg-dark bg-opacity-10 p-2 rounded ps-3 d-sm-block d-md-flex justify-content-between align-items-center">
      <div class="d-md-flex align-items-center">
      <div class="w-md-25">
        <span class="me-md-2 mb-sm-2">
          <b>Filtrar: </b>
        </span> 
        <input class="w-md-75" type="text" v-model="searchValue" />
      </div>

      <p class="m-sm-3 m-md-0 mx-md-3 fw-bold">
        <i class="icon-question-sign fs-5"></i>
        &nbsp;É possível filtrar por qualquer item ou palavra que esteja na tabela, inteira ou parte. Exemplo: nome do
        colaborador, demandante, data, notas, etc.
      </p>
</div>
      <Excel />
    </div>

    <EasyDataTable
      show-index
      id="tabela"
      :headers="visibleHeaders"
      :items="colabcUser"
      rowsPerPageMessage="linhas por página:"
      rowsOfPageSeparatorMessage="de"
      emptyMessage="Não há dados disponíveis"
      :buttons-pagination="true"
      :search-value="searchValue"
      alternating
    >
      <!--v-model:items-selected="itemsSelected"-->

      <template #item-operation="registro">
        <div v-if="dados.admin" class="operation-wrapper">
          <button type="button" :aria-label="`Remover registro de ${registro.colab}`"
            aria-haspopup="dialog" aria-controls="delete-registro-modal" @click="modal(registro)">
            <img src="../../assets/delete.png" class="operation-icon" alt="" />
          </button>
        </div>
      </template>
    </EasyDataTable>

    <ConfirmDeleteModal v-if="dados.admin" id="delete-registro-modal" v-model="showDelete" @confirm="deleteItem">
      Remover registro de: <b>{{ registro }}</b> ?
    </ConfirmDeleteModal>
  </div>
</template>

<script>
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
        { text: "Remover", value: "operation" },
        { text: "Profissional", value: "colab", sortable: true, width: 200 },
        { text: "Data Aval.", value: "created_at", sortable: true },
        { text: "Avaliação", value: "avaliacao", sortable: true },
        { text: "Nível", value: "nivel", sortable: true },
        { text: "Desc (%)", value: "desconto", sortable: true },
        { text: "Nota Qld", value: "nota_qualidade", sortable: true },
        { text: "Obs Qld", value: "obs_qualidade", sortable: true },
        { text: "Nota Prazo", value: "nota_prazo", sortable: true },
        { text: "Obs. Prazo", value: "obs_prazo", sortable: true },
        { text: "Nota Disp.", value: "nota_dispon", sortable: true },
        { text: "Obs. Disp.", value: "obs_dispon", sortable: true },
        { text: "Nota Rsp.", value: "nota_respon", sortable: true },
        { text: "Obs. Rsp.", value: "obs_respon", sortable: true },
        { text: "Itens Qld", value: "itensQualidade", sortable: true },
        { text: "Itens Disp.", value: "itensDispon", sortable: true },
        { text: "Liderança", value: "liderancas", sortable: true },
        { text: "Demandante", value: "demandante", sortable: true, width: 100 },
      ],
    };
  },
  components: {
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

          if (this.admin) {
            this.colabcUser = this.registros;
          } else {
            this.colabcUser = this.registros.filter(
              (registro) => registro.demandante === dados.email
            );
          }

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

<style lang="scss" scoped>
.operation-icon {
  width: 20px;
  cursor: pointer;
}
p{
    color: green;
}
</style>
