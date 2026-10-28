<script>
import ManagementPage from '@/components/utils/ManagementPage.vue'
import ConfirmDeleteModal from '@/components/utils/ConfirmDeleteModal.vue'
import axios from '@/plugins/axios.js'

export default {
  components: { ManagementPage, ConfirmDeleteModal },
  data() { return { rows: [], demandantes: [], form: { nome: '', demandante_id: '' }, editingId: null, search: '',
    loading: false, busy: false, error: '', message: '', showDelete: false, selected: null, disposed: false } },
  computed: {
    available() { return this.demandantes.filter(row => row.active && !row.deletedAt) },
    filtered() { const term = this.search.toLocaleLowerCase(); return this.rows.filter(row => `${row.nome} ${row.demandante_nome || ''} ${row.demandante || ''}`.toLocaleLowerCase().includes(term)) },
  },
  methods: {
    async load() {
      this.loading = true; this.error = ''
      try { const [departments, accounts] = await Promise.all([axios.get('/gerencias?estado=todos'), axios.get('/demandantes')]); if (!this.disposed) { this.rows = departments.data; this.demandantes = accounts.data } }
      catch { this.error = 'Não foi possível carregar as gerências e os demandantes.' }
      finally { this.loading = false }
    },
    reset() { this.editingId = null; this.form = { nome: '', demandante_id: '' } },
    edit(row) { this.editingId = row.id; this.form = { nome: row.nome, demandante_id: row.demandante_id }; this.error = ''; this.message = ''; this.$refs.nameField?.focus() },
    async save() {
      if (this.busy || this.loading || !this.available.some(row => row.id === Number(this.form.demandante_id))) return
      this.busy = true; this.error = ''; this.message = ''
      try {
        if (this.editingId) await axios.put(`/gerencias/${this.editingId}`, this.form)
        else await axios.post('/gerencias', this.form)
        if (this.disposed) return
        this.reset(); await this.load(); this.message = 'Gerência salva. O acesso dos responsáveis acompanha a atribuição atual.'
      } catch (error) { this.error = error.response?.status === 409 ? 'Demandante indisponível. Atualize a lista e selecione uma conta ativa.' : 'Não foi possível salvar a gerência.' }
      finally { this.busy = false }
    },
    askRemove(row) { this.selected = row; this.showDelete = true; this.error = ''; this.message = '' },
    async remove() {
      if (this.busy || !this.selected) return
      const id = this.selected.id; this.busy = true
      try { await axios.delete(`/gerencias/${id}`); if (!this.disposed) { await this.load(); if (this.editingId === id) this.reset(); this.message = 'Gerência arquivada. O histórico foi preservado.' } }
      catch (error) { this.error = error.response?.status === 409 ? 'Transfira ou arquive os profissionais antes de arquivar a gerência.' : 'Não foi possível arquivar a gerência.' }
      finally { this.busy = false }
    },
  },
  mounted() { this.load() },
  beforeUnmount() { this.disposed = true },
}
</script>

<template>
  <ManagementPage title="Gerências" description="Organize os profissionais e defina um demandante responsável por gerência.">
    <template #actions><router-link to="/demandantes" class="mp-button mp-button-secondary">Gerenciar demandantes</router-link></template>
    <p v-if="error" role="alert" class="mp-feedback mp-feedback-error">{{ error }} <button type="button" @click="load">Atualizar listas</button></p>
    <p v-if="message" role="status" class="mp-feedback">{{ message }}</p>
    <form class="mp-card mp-admin-form" @submit.prevent="save">
      <h2>{{ editingId ? 'Editar gerência' : 'Cadastrar gerência' }}</h2>
      <div class="mp-fields">
        <div class="mp-field"><label for="gerencia-nome">Nome da gerência</label><input id="gerencia-nome" ref="nameField" class="mp-input" v-model="form.nome" required maxlength="255" :disabled="busy" /></div>
        <div class="mp-field"><label for="gerencia-demandante">Demandante responsável</label><select id="gerencia-demandante" class="mp-input" v-model="form.demandante_id" required :disabled="busy || loading" aria-describedby="transferencia-ajuda"><option disabled value="">Selecione um demandante</option><option v-for="row in available" :key="row.id" :value="row.id">{{ row.name }} — {{ row.email }}</option></select><p v-if="!loading && !available.length">Cadastre um demandante ativo para continuar.</p></div>
      </div>
      <p id="transferencia-ajuda">Ao mudar o responsável, o novo demandante recebe acesso ao histórico dos profissionais da gerência. O anterior perde esse acesso, salvo se for administrador. A autoria das avaliações é preservada.</p>
      <div class="mp-admin-actions"><button type="submit" class="mp-button mp-button-primary" :disabled="busy || loading || !available.length">{{ busy ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar gerência' }}</button><button v-if="editingId" type="button" class="mp-button mp-button-secondary" @click="reset" :disabled="busy">Cancelar edição</button></div>
    </form>
    <section class="mp-card mp-admin-list" aria-label="Gerências cadastradas" :aria-busy="loading">
      <div class="mp-toolbar"><div class="mp-search"><label for="busca-gerencias">Buscar gerências</label><input id="busca-gerencias" type="search" class="mp-input" v-model="search" placeholder="Gerência ou demandante" /></div><span class="mp-count">Total: <strong>{{ filtered.length }}</strong></span></div>
      <p v-if="loading" class="mp-feedback" role="status">Carregando gerências…</p>
      <div v-else class="mp-table-scroll"><table class="mp-native-table"><caption class="sr-only">Gerências e seus demandantes atuais</caption><thead><tr><th>Gerência</th><th>Demandante</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
        <tr v-for="row in filtered" :key="row.id"><td>{{ row.nome }} <small>#{{ row.id }}</small></td><td>{{ row.demandante_nome || 'Conta indisponível' }}<br /><small>{{ row.demandante }}</small></td><td>{{ row.deletedAt ? 'Arquivada' : row.demandante_disponivel ? 'Ativa' : 'Demandante indisponível' }}</td><td class="mp-row-actions"><button type="button" class="mp-button mp-button-secondary" @click="edit(row)" :disabled="busy" :aria-label="`Editar gerência ${row.nome}`">Editar</button><button v-if="!row.deletedAt" type="button" class="mp-button mp-button-danger" @click="askRemove(row)" :disabled="busy" :aria-label="`Arquivar gerência ${row.nome}`">Arquivar</button></td></tr>
        <tr v-if="!filtered.length"><td colspan="4">Nenhuma gerência encontrada.</td></tr>
      </tbody></table></div>
    </section>
    <ConfirmDeleteModal id="delete-gerencia-modal" v-model="showDelete" @confirm="remove">Arquivar <b>{{ selected?.nome }}</b>? Transfira ou arquive os profissionais ativos antes de continuar.</ConfirmDeleteModal>
  </ManagementPage>
</template>
