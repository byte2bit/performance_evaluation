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
                gerencia_id: "",
            },
            gerencias: [], loading: true, saving: false, loadError: '', editingId: null, disposed: false,
        }
    },
    components: {
        ManagementPage,
        toast
    },
    computed: {
        selectedDepartment() { return this.gerencias.find(row => row.id === Number(this.postData.gerencia_id)) },
        responsible() { const row = this.selectedDepartment; return row ? `${row.demandante_nome || ''} — ${row.demandante || 'Conta indisponível'}` : '' },
    },
    methods: {
        async loadPage() {
            await this.loadGerencias()
            if (this.loadError || !this.editingId) return
            this.loading = true
            try {
                const { data } = await axios.get(`/colab/${this.editingId}`)
                if (!this.disposed) for (const key of Object.keys(this.postData)) this.postData[key] = data[key] ?? ''
            } catch { this.loadError = 'Não foi possível carregar o profissional.' }
            finally { this.loading = false }
        },
        async loadGerencias() {
            this.loading = true; this.loadError = ''
            try {
                const response = await axios.get('/gerencias')
                if (!this.disposed) this.gerencias = response.data.filter(row => row.demandante_disponivel && !row.deletedAt)
            } catch { this.loadError = 'Não foi possível carregar as gerências. Tente novamente.' }
            finally { this.loading = false }
        },
        notify: function () {
            toast.success("Dados registrados!", {
                autoClose: 1000,
                theme: 'colored',
            })
        },
        save: function () {
            if (this.saving || this.loading || this.loadError || !this.selectedDepartment) return Promise.resolve()
            this.saving = true
            const request = this.editingId ? axios.put(`/colab/${this.editingId}`, this.postData) : axios.post('/colab', this.postData)
            return request
                .then(() => {
                    if (this.disposed) return
                    if (this.editingId) { this.notify(); return this.$router.push('/colabs') }
                    this.reset()
                    // console.log(this.postData)
                    this.notify()
                })
                .catch(async error => {
                    toast.error(error.response?.status === 409 ? 'A gerência ou seu demandante ficou indisponível. Atualize a lista.' : 'Não foi possível registrar o profissional. Tente novamente.', { theme: 'colored' })
                    if (error.response?.status === 409) await this.loadGerencias()
                }).finally(() => { this.saving = false })
        },
        reset() {
            this.postData.matricula = "",
            this.postData.colab = ""
            this.postData.ppu = ""
            this.postData.servico = ""
            this.postData.funcao = ""
            this.postData.liderancas = ""
            this.postData.gerencia_id = ""
        },
        // console.log(this.postData)
    },
    async mounted() {
        this.editingId = this.$route?.params?.id || null
        await this.loadPage()
    },
    beforeUnmount() { this.disposed = true },
}
</script>

<template>
  <ManagementPage :title="editingId ? 'Editar profissional' : 'Inserir profissional'" description="Preencha os dados e selecione a gerência responsável." narrow>
    <template #actions><router-link to="/colabs" class="mp-button mp-button-secondary">Ver profissionais</router-link></template>
    <form class="mp-card" @submit.prevent="save">
      <fieldset :disabled="loading || saving">
      <section class="mp-form-section" aria-labelledby="secao-1">
        <div class="mp-section-heading"><span class="mp-section-number" aria-hidden="true">01</span>
          <div><h2 id="secao-1">Identificação</h2><p>Dados para identificar o profissional.</p></div>
        </div>
        <div class="mp-fields">
          <div class="mp-field mp-field-wide">
            <label for="profissional">Nome do profissional</label>
            <input id="profissional" class="mp-input" type="text" v-model="postData.colab" placeholder="Nome completo" required maxlength="255" />
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
            <select id="gerencia" class="mp-input" v-model="postData.gerencia_id" required :disabled="loading || saving" aria-describedby="gerencia-ajuda">
              <option disabled value="">{{ loading ? 'Carregando gerências…' : 'Selecione uma gerência' }}</option>
              <option v-for="row in gerencias" :key="row.id" :value="row.id">{{ row.nome }} · {{ row.demandante_nome }} (#{{ row.id }})</option>
            </select>
            <p id="gerencia-ajuda">O acesso aos profissionais acompanha o demandante da gerência.</p>
          </div>
          <div class="mp-field mp-field-wide">
            <label for="demandante">Demandante</label>
            <input id="demandante" class="mp-input" type="text" :value="responsible" placeholder="Selecione a gerência" readonly />
            <p>Responsável definido no cadastro da gerência. <router-link to="/gerencias">Gerenciar gerências</router-link></p>
          </div>
        </div>
      </section>
      </fieldset>
      <div class="mp-feedback" role="status" v-if="loadError || (!loading && !gerencias.length)">
        <p>{{ loadError || 'Cadastre uma gerência com demandante ativo antes de inserir o profissional.' }}</p>
        <button v-if="loadError" type="button" class="mp-button mp-button-secondary" @click="loadPage">Tentar novamente</button>
        <router-link v-else to="/gerencias" class="mp-button mp-button-secondary">Cadastrar gerência</router-link>
      </div>
      <div class="mp-form-actions">
        <router-link to="/" class="mp-button mp-button-secondary">Voltar</router-link>
        <button type="submit" class="mp-button mp-button-primary" :disabled="saving || loading || !!loadError || !selectedDepartment">{{ saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Enviar' }}</button>
      </div>
    </form>
  </ManagementPage>
</template>
