<script>
import ManagementPage from "@/components/utils/ManagementPage.vue"
import axios from '@/plugins/axios.js'
import { toast } from 'vue3-toastify'
import 'vue3-toastify/dist/index.css'

export default {
    data() {
        return {
            postData: {
                matricula: "",
                colab: "",
                ppu: "",
                servico: "",
                funcao: "",
                liderancas: "",
                gerencia: "",
                demandante: "",
            }
        }
    },
    components: {
        ManagementPage,
        toast
    },
    methods: {
        notify: function () {
            toast.success("Dados registrados!", {
                autoClose: 1000,
                theme: 'colored',
            })
        },
        save: function () {
            return axios.post('/colab', this.postData)
                .then(() => {
                    this.reset()
                    // console.log(this.postData)
                    this.notify()
                })
                .catch(() => {
                    toast.error('Não foi possível registrar o profissional. Tente novamente.', { theme: 'colored' })
                })
        },
        reset() {
            this.postData.matricula = "",
            this.postData.colab = ""
            this.postData.ppu = ""
            this.postData.servico = ""
            this.postData.funcao = ""
            this.postData.liderancas = ""
            this.postData.gerencia = ""
            this.postData.demandante = ""
        },
        // console.log(this.postData)
    },
}
</script>

<template>
  <ManagementPage title="Inserir profissional" description="Preencha os dados de identificação, atuação e responsabilidade." narrow>
    <template #actions><router-link to="/colabs" class="mp-button mp-button-secondary">Ver profissionais</router-link></template>
    <form class="mp-card" @submit.prevent="save">
      <section class="mp-form-section" aria-labelledby="secao-1">
        <div class="mp-section-heading"><span class="mp-section-number" aria-hidden="true">01</span>
          <div><h2 id="secao-1">Identificação</h2><p>Dados para identificar o profissional.</p></div>
        </div>
        <div class="mp-fields">
          <div class="mp-field mp-field-wide">
            <label for="profissional">Nome do profissional</label>
            <input id="profissional" class="mp-input" type="text" v-model="postData.colab" placeholder="Nome completo" />
          </div>
          <div class="mp-field">
            <label for="matricula">Matrícula</label>
            <input id="matricula" class="mp-input" type="text" v-model="postData.matricula" placeholder="Ex.: 000123" />
          </div>
        </div>
      </section>
      <section class="mp-form-section" aria-labelledby="secao-2">
        <div class="mp-section-heading"><span class="mp-section-number" aria-hidden="true">02</span>
          <div><h2 id="secao-2">Atuação</h2><p>Serviço e função exercidos no contrato.</p></div>
        </div>
        <div class="mp-fields">
          <div class="mp-field">
            <label for="ppu">Item de PPU</label>
            <input id="ppu" class="mp-input" type="text" v-model="postData.ppu" placeholder="Ex.: 1.1" />
          </div>
          <div class="mp-field">
            <label for="servico">Serviço</label>
            <input id="servico" class="mp-input" type="text" v-model="postData.servico" placeholder="Nome do serviço" />
          </div>
          <div class="mp-field mp-field-wide">
            <label for="funcao">Função</label>
            <input id="funcao" class="mp-input" type="text" v-model="postData.funcao" placeholder="Função exercida" />
          </div>
        </div>
      </section>
      <section class="mp-form-section" aria-labelledby="secao-3">
        <div class="mp-section-heading"><span class="mp-section-number" aria-hidden="true">03</span>
          <div><h2 id="secao-3">Responsáveis</h2><p>Lideranças e demandante vinculados ao profissional.</p></div>
        </div>
        <div class="mp-fields">
          <div class="mp-field">
            <label for="liderancas">Lideranças</label>
            <input id="liderancas" class="mp-input" type="text" v-model="postData.liderancas" placeholder="Nome das lideranças" />
          </div>
          <div class="mp-field">
            <label for="gerencia">Gerência</label>
            <input id="gerencia" class="mp-input" type="text" v-model="postData.gerencia" placeholder="Nome da gerência" />
          </div>
          <div class="mp-field mp-field-wide">
            <label for="demandante">Demandante</label>
            <input id="demandante" class="mp-input" type="text" v-model="postData.demandante" placeholder="E-mail do demandante" />
            <p>Informe o e-mail da conta responsável pelas avaliações deste profissional.</p>
          </div>
        </div>
      </section>
      <div class="mp-form-actions">
        <router-link to="/" class="mp-button mp-button-secondary">Voltar</router-link>
        <button type="submit" class="mp-button mp-button-primary">Enviar</button>
      </div>
    </form>
  </ManagementPage>
</template>
