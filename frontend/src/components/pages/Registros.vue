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
      :headers="headers"
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
        <div class="operation-wrapper">
          <img
            src="../../assets/delete.png"
            class="operation-icon"
            data-bs-toggle="modal"
            data-bs-target="#exampleModal"
            @click="modal(registro)"
          />
        </div>
      </template>
    </EasyDataTable>

    <!--***** Modal ********-->
    <div
      class="modal fade"
      id="exampleModal"
      tabindex="-1"
      aria-labelledby="exampleModalLabel"
      
    >
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <img id="svg" src="../../assets/triangule.svg" alt="" />

            <h1 class="modal-title fs-5" id="exampleModalLabel">Remover</h1>
            <button
              type="button"
              class="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close"
            ></button>
          </div>
          <div class="modal-body">
            Remover registro de: <b>{{ registro }}</b> ?
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-primary"
              data-bs-dismiss="modal"
              @click="deleteItem(registro)"
            >
              Sim
            </button>
            <button
              type="button"
              class="btn btn-secondary"
              data-bs-dismiss="modal"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
    <!--***** /Modal ********-->
  </div>
</template>

<script>
import axios from "axios";
import Vue3EasyDataTable from "vue3-easy-data-table";
import "vue3-easy-data-table/dist/style.css";

import { dados } from "../../js/store.js";

import { toast } from "vue3-toastify";
import "vue3-toastify/dist/index.css";

import Excel from "./Excel.vue";

export default {
  data() {
    return {
      dados: {},
      colabcUser: [],
      items: [],
      registros: [],
      registro: {},
      itemsSelected: [],
      regId: "",
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
    toast,
    dados,
    Excel,
  },
  methods: {
    notify() {
      toast.success("Registro removido.", {
        autoClose: 1000,
        theme: "colored",
      });
    },
    loadRegs() {
      axios
        .get("registros")
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
        .catch("Erro");
    },
    loadReg(registro) {
      this.registro = { ...registro };
      // console.log("registro: " + this.registro)
    },
    modal(registro) {
      this.lReg = { ...registro };
      this.registro = this.lReg.colab;
      this.regId = this.lReg.id;
    },
    deleteItem() {
      // console.log("lReg: " + JSON.stringify(this.lReg))

      this.registros = this.registros.filter((item) => item.id !== this.regId);

      axios
        .delete(`registros/${this.regId}`)
        .then(() => {
          this.notify();
        })
        .catch("Erro");
    },
  },
  mounted() {
    this.loadRegs();
  },
};
</script>

<style lang="scss" scoped>
#svg {
  width: 40px;
  margin-right: 20px;
  color: orange;
}

.operation-icon {
  width: 20px;
  cursor: pointer;
}
p{
    color: green;
}
</style>
