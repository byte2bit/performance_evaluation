<script setup>
import { computed, ref } from 'vue'
import { useFlowbiteModal } from '@/composables/useFlowbiteModal.js'
import { buildMonthlyHistory, criteria, displayValue, formatRecordDate } from './record-history.js'
import '@/styles/record-history.css'

const props = defineProps({
    id: { type: String, default: 'professional-history-modal' },
    professionalName: { type: String, default: '' },
    professionalId: { type: [Number, String], default: null },
    records: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
})
defineEmits(['retry'])
const visible = defineModel({ type: Boolean, default: false })
const modalElement = ref(null)
useFlowbiteModal(modalElement, visible)
const enabledSeries = ref(criteria.map(criterion => criterion.key))
const months = computed(() => buildMonthlyHistory(props.records))
const orderedRecords = computed(() => [...props.records].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')) || Number(b.id) - Number(a.id)))
const firstMonth = computed(() => months.value[0]?.ordinal || 0)
const span = computed(() => Math.max(1, (months.value.at(-1)?.ordinal || firstMonth.value) - firstMonth.value))
const width = computed(() => Math.max(700, Math.min(1800, (span.value + 1) * 75)))
const x = ordinal => months.value.length === 1 ? width.value / 2 : 54 + (ordinal - firstMonth.value) / span.value * (width.value - 86)
const y = value => 230 - (value - 1) * 48
const ticks = computed(() => {
    if (!months.value.length) return []
    const end = months.value.at(-1).ordinal
    const step = Math.max(1, Math.ceil((end - firstMonth.value + 1) / 14))
    const ordinals = []
    for (let ordinal = firstMonth.value; ordinal <= end; ordinal += step) ordinals.push(ordinal)
    if (ordinals.at(-1) !== end) ordinals.push(end)
    return ordinals.map(ordinal => ({ ordinal,
        label: `${String(ordinal % 12 + 1).padStart(2, '0')}/${Math.floor(ordinal / 12)}` }))
})
const series = computed(() => criteria.filter(criterion => enabledSeries.value.includes(criterion.key)).map(criterion => {
    const segments = []
    let segment = [], previous = null
    for (const month of months.value) {
        const value = month[criterion.key]
        if (value === null || previous !== null && month.ordinal !== previous + 1) {
            if (segment.length) segments.push(segment)
            segment = []
        }
        if (value !== null) segment.push({ month, value, x: x(month.ordinal), y: y(value) })
        previous = month.ordinal
    }
    if (segment.length) segments.push(segment)
    return { ...criterion, segments, points: segments.flat() }
}))
const hasLegacyDuplicates = computed(() => months.value.some(month => month.count > 1))
const noteFields = [
    { title: 'Qualidade', note: 'nota_qualidade', comment: 'obs_qualidade', items: 'itensQualidade' },
    { title: 'Prazo', note: 'nota_prazo', comment: 'obs_prazo' },
    { title: 'Disponibilidade', note: 'nota_dispon', comment: 'obs_dispon', items: 'itensDispon' },
    { title: 'Responsabilidade', note: 'nota_respon', comment: 'obs_respon' },
]
function toggleSeries(key) {
    enabledSeries.value = enabledSeries.value.includes(key) ? enabledSeries.value.filter(value => value !== key) : [...enabledSeries.value, key]
}
const number = value => value === null ? 'Não informado' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value)
</script>

<template>
  <teleport to="body">
    <div :id="id" ref="modalElement" tabindex="-1" aria-hidden="true" :aria-labelledby="`${id}-title`"
      class="app-modal record-history fixed inset-0 z-50 hidden w-full overflow-y-auto">
      <div class="app-modal-panel app-modal-large">
        <header class="app-modal-header rh-heading">
          <div>
            <span class="app-modal-eyebrow">Histórico de avaliações</span>
            <h2 :id="`${id}-title`">{{ professionalName }}</h2>
            <p>Profissional #{{ professionalId }} · Histórico completo autorizado</p>
          </div>
          <button type="button" class="app-modal-button" aria-label="Fechar histórico" @click="visible = false">Fechar</button>
        </header>
        <div class="app-modal-body" :aria-busy="loading">
          <p v-if="loading" role="status">Carregando histórico…</p>
          <div v-else-if="error" role="alert" class="rh-error">
            <p>{{ error }}</p>
            <button type="button" class="app-modal-button" @click="$emit('retry')">Tentar novamente</button>
          </div>
          <p v-else-if="!records.length" role="status">Não há avaliações disponíveis para este profissional.</p>
          <template v-else>
            <p class="rh-overview">{{ records.length }} avaliação(ões) · {{ months.length }} mês(es) com registros</p>
            <section class="rh-chart" :aria-labelledby="`${id}-chart-heading`">
              <h3 :id="`${id}-chart-heading`">Notas por mês</h3>
              <p v-if="hasLegacyDuplicates" class="rh-chart-note">Há meses com mais de uma avaliação antiga. O gráfico apresenta a média de cada nota no mês; todas as avaliações estão detalhadas abaixo.</p>
              <p v-else class="rh-chart-note">Escala de 1 a 5. Meses sem avaliação ficam sem pontos. Selecione as séries para comparar.</p>
              <ul class="rh-legend" aria-label="Séries do gráfico">
                <li v-for="criterion in criteria" :key="criterion.key">
                  <button type="button" :aria-pressed="enabledSeries.includes(criterion.key)" @click="toggleSeries(criterion.key)">
                    <svg width="28" height="12" aria-hidden="true"><line x1="0" y1="6" x2="28" y2="6" :stroke="criterion.color" stroke-width="3" :stroke-dasharray="criterion.dash" /></svg>
                    {{ criterion.label }}
                  </button>
                </li>
              </ul>
              <p v-if="months.length" class="rh-chart-note rh-scroll-hint">Deslize o gráfico para consultar todos os meses.</p>
              <div v-if="months.length" class="rh-chart-scroll" tabindex="0" aria-label="Gráfico mensal com rolagem horizontal">
                <svg :viewBox="`0 0 ${width} 290`" :style="{ minWidth: `${width}px` }" role="img" :aria-labelledby="`${id}-graph-title ${id}-graph-description`">
                  <title :id="`${id}-graph-title`">Notas mensais de {{ professionalName }}</title>
                  <desc :id="`${id}-graph-description`">Meses no eixo horizontal e notas de 1 a 5 no vertical. Os valores do gráfico também estão na tabela de médias mensais.</desc>
                  <g v-for="grade in [1, 2, 3, 4, 5]" :key="grade">
                    <line x1="54" :x2="width - 32" :y1="y(grade)" :y2="y(grade)" class="rh-grid" />
                    <text x="36" :y="y(grade) + 4" text-anchor="end">{{ grade }}</text>
                  </g>
                  <g v-for="tick in ticks" :key="tick.ordinal">
                    <text :x="x(tick.ordinal)" y="254" text-anchor="middle">{{ tick.label }}</text>
                  </g>
                  <text :x="width / 2" y="281" text-anchor="middle">Mês / ano</text>
                  <g v-for="line in series" :key="line.key">
                    <polyline v-for="(segment, index) in line.segments" :key="index" :points="segment.map(point => `${point.x},${point.y}`).join(' ')"
                      fill="none" :stroke="line.color" stroke-width="2.5" :stroke-dasharray="line.dash" />
                    <circle v-for="point in line.points" :key="point.month.month" :cx="point.x" :cy="point.y" r="4" :fill="line.color">
                      <title>{{ point.month.label }} · {{ line.label }}: {{ number(point.value) }} · {{ point.month.count }} avaliação(ões)</title>
                    </circle>
                  </g>
                </svg>
              </div>
              <p v-else>Não há datas válidas para montar o gráfico.</p>
              <details v-if="months.length" class="rh-monthly-values">
                <summary>Consultar médias mensais em tabela</summary>
                <div class="rh-table-scroll">
                  <table>
                    <caption>Médias das notas registradas em cada mês</caption>
                    <thead><tr><th scope="col">Mês</th><th scope="col">Avaliações</th><th v-for="criterion in criteria" :key="criterion.key" scope="col">{{ criterion.label }}</th></tr></thead>
                    <tbody><tr v-for="month in months" :key="month.month"><th scope="row">{{ month.label }}</th><td>{{ month.count }}</td><td v-for="criterion in criteria" :key="criterion.key">{{ number(month[criterion.key]) }}</td></tr></tbody>
                  </table>
                </div>
              </details>
            </section>
            <section class="rh-evaluations" :aria-labelledby="`${id}-evaluations-heading`">
              <h3 :id="`${id}-evaluations-heading`">Todas as avaliações</h3>
              <article v-for="record in orderedRecords" :key="record.id" class="rh-evaluation">
                <header><h4>Avaliação #{{ record.id }}</h4><p>{{ formatRecordDate(record.created_at, true) }}</p></header>
                <dl class="rh-metadata">
                  <div><dt>Profissional registrado</dt><dd>{{ displayValue(record.colab) }}</dd></div>
                  <div><dt>Avaliador original</dt><dd>{{ displayValue(record.demandante) }}</dd></div>
                  <div><dt>Média geral</dt><dd>{{ displayValue(record.avaliacao) }}</dd></div>
                  <div><dt>Nível</dt><dd>{{ displayValue(record.nivel) }}</dd></div>
                  <div><dt>Desconto</dt><dd>{{ displayValue(record.desconto) }}</dd></div>
                  <div><dt>Liderança</dt><dd>{{ displayValue(record.liderancas) }}</dd></div>
                  <div><dt>Última atualização</dt><dd>{{ formatRecordDate(record.updated_at, true) }}</dd></div>
                </dl>
                <div class="rh-notes">
                  <section v-for="criterion in noteFields" :key="criterion.note">
                    <h5>{{ criterion.title }} · Nota {{ displayValue(record[criterion.note]) }}</h5>
                    <dl><dt>Comentários</dt><dd>{{ displayValue(record[criterion.comment]) }}</dd>
                      <template v-if="criterion.items"><dt>Critérios registrados</dt><dd>{{ displayValue(record[criterion.items]) }}</dd></template>
                    </dl>
                  </section>
                </div>
              </article>
            </section>
          </template>
        </div>
      </div>
    </div>
  </teleport>
</template>
