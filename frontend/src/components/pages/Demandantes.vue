<script>
import ManagementPage from '@/components/utils/ManagementPage.vue'
import ConfirmDeleteModal from '@/components/utils/ConfirmDeleteModal.vue'
import axios from '@/plugins/axios.js'

export default {
  components: { ManagementPage, ConfirmDeleteModal },
  data() { return { rows: [], search: '', form: { name: '', email: '', password: '', confirmation: '' }, editingId: null,
    loading: false, busy: false, error: '', message: '', showDelete: false, selected: null, disposed: false } },
  computed: {
    filtered() { const term = this.search.toLocaleLowerCase(); return this.rows.filter(row => `${row.name} ${row.email}`.toLocaleLowerCase().includes(term)) },
  },
  methods: {
    async load() {
      this.loading = true; this.error = ''
      try { const { data } = await axios.get('/demandantes'); if (!this.disposed) this.rows = data }
      catch { this.error = 'Não foi possível carregar os demandantes.' }
      finally { this.loading = false }
    },
    reset() { this.editingId = null; this.form = { name: '', email: '', password: '', confirmation: '' } },
    edit(row) { this.editingId = row.id; this.form = { name: row.name, email: row.email, password: '', confirmation: '' }; this.error = ''; this.message = ''; this.$refs.nameField?.focus() },
    async save() {
      if (this.busy) return
      this.error = ''; this.message = ''
      if (!this.editingId && (this.form.password !== this.form.confirmation || [...this.form.password].length < 15 || [...this.form.password].length > 128)) {
        this.error = 'Informe senhas iguais, com 15 a 128 caracteres.'; return
      }
      this.busy = true
      const data = { name: this.form.name, email: this.form.email }
      if (!this.editingId) data.password = this.form.password
      try {
        if (this.editingId) await axios.put(`/demandantes/${this.editingId}`, data)
        else await axios.post('/demandantes', data)
        if (this.disposed) return
        this.reset(); await this.load(); this.message = 'Demandante salvo. Alterações de conta encerram suas sessões anteriores.'
      } catch (error) { this.error = error.response?.status === 409 ? 'Este e-mail já está cadastrado.' : 'Não foi possível salvar o demandante.' }
      finally { this.form.password = ''; this.form.confirmation = ''; this.busy = false }
    },
    askRemove(row) { this.selected = row; this.showDelete = true; this.error = ''; this.message = '' },
    async remove() {
      if (this.busy || !this.selected) return
      const id = this.selected.id; this.busy = true; this.error = ''; this.message = ''
      try { await axios.delete(`/demandantes/${id}`); if (!this.disposed) { this.rows = this.rows.filter(row => row.id !== id); if (this.editingId === id) this.reset(); this.message = 'Acesso excluído. O histórico foi preservado.' } }
      catch (error) { this.error = error.response?.status === 409 ? 'Reatribua as gerências e preserve sua conta e o último administrador ativo.' : 'Não foi possível excluir o demandante.' }
      finally { this.busy = false }
    },
  },
  mounted() { this.load() },
  beforeUnmount() { this.disposed = true; this.form.password = ''; this.form.confirmation = '' },
}
</script>

<template>
  <ManagementPage title="Demandantes" description="Cadastre as contas e mantenha os responsáveis pelas gerências.">
    <template #actions><router-link to="/gerencias" class="mp-button mp-button-secondary">Gerenciar gerências</router-link></template>
    <p v-if="error" role="alert" class="mp-feedback mp-feedback-error">{{ error }} <button v-if="!rows.length" type="button" @click="load">Tentar novamente</button></p>
    <p v-if="message" role="status" class="mp-feedback">{{ message }}</p>
    <form class="mp-card mp-admin-form" @submit.prevent="save">
      <h2>{{ editingId ? 'Editar demandante' : 'Cadastrar demandante' }}</h2>
      <p>Novos demandantes recebem conta de avaliador. O responsável pode trocar sua senha após entrar.</p>
      <div class="mp-fields">
        <div class="mp-field"><label for="demandante-nome">Nome</label><input ref="nameField" id="demandante-nome" class="mp-input" v-model="form.name" required maxlength="255" :disabled="busy" autocomplete="name" /></div>
        <div class="mp-field"><label for="demandante-email">E-mail</label><input id="demandante-email" class="mp-input" type="email" v-model="form.email" required maxlength="254" :disabled="busy" autocomplete="off" /></div>
        <template v-if="!editingId">
          <div class="mp-field"><label for="demandante-senha">Senha inicial</label><input id="demandante-senha" class="mp-input" type="password" v-model="form.password" required minlength="15" maxlength="128" :disabled="busy" autocomplete="new-password" aria-describedby="senha-ajuda" /><p id="senha-ajuda">De 15 a 128 caracteres.</p></div>
          <div class="mp-field"><label for="demandante-confirmacao">Confirmar senha</label><input id="demandante-confirmacao" class="mp-input" type="password" v-model="form.confirmation" required minlength="15" maxlength="128" :disabled="busy" autocomplete="new-password" /></div>
        </template>
      </div>
      <div class="mp-admin-actions"><button type="submit" class="mp-button mp-button-primary" :disabled="busy">{{ busy ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar demandante' }}</button><button v-if="editingId" type="button" class="mp-button mp-button-secondary" @click="reset" :disabled="busy">Cancelar edição</button></div>
    </form>
    <section class="mp-card mp-admin-list" aria-label="Demandantes cadastrados" :aria-busy="loading">
      <div class="mp-toolbar"><div class="mp-search"><label for="busca-demandantes">Buscar demandantes</label><input id="busca-demandantes" class="mp-input" type="search" v-model="search" placeholder="Nome ou e-mail" /></div><span class="mp-count">Total: <strong>{{ filtered.length }}</strong></span></div>
      <p v-if="loading" class="mp-feedback" role="status">Carregando demandantes…</p>
      <div v-else class="mp-table-scroll"><table class="mp-native-table"><caption class="sr-only">Contas disponíveis para atribuição às gerências</caption><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
        <tr v-for="row in filtered" :key="row.id"><td>{{ row.name }}</td><td>{{ row.email }}</td><td>{{ row.admin ? 'Administrador' : 'Demandante' }}</td><td>{{ row.active ? 'Ativo' : 'Inativo' }}</td><td class="mp-row-actions"><button type="button" class="mp-button mp-button-secondary" @click="edit(row)" :disabled="busy" :aria-label="`Editar demandante ${row.name}`">Editar</button><button type="button" class="mp-button mp-button-danger" @click="askRemove(row)" :disabled="busy" :aria-label="`Excluir demandante ${row.name}`">Excluir acesso</button></td></tr>
        <tr v-if="!filtered.length"><td colspan="5">Nenhum demandante encontrado.</td></tr>
      </tbody></table></div>
    </section>
    <ConfirmDeleteModal id="delete-demandante-modal" v-model="showDelete" @confirm="remove">Excluir o acesso de <b>{{ selected?.name }}</b>? As gerências deverão estar reatribuídas. As avaliações serão preservadas.</ConfirmDeleteModal>
  </ManagementPage>
</template>
