import { defineStore } from 'pinia'
import { ref, computed } from "vue"
import axios from '@/plugins/axios.js'
import { toast } from 'vue3-toastify'

export const useColabStore = defineStore('colabs', () => {
    const chkColabs = ref([])
    const colabs = ref([])
    const selectedColabs = computed(() => colabs.value.filter(person => chkColabs.value.includes(person.id)))
    const nameCounts = computed(() => {
        const counts = new Map()
        for (const person of colabs.value) counts.set(person.colab, (counts.get(person.colab) || 0) + 1)
        return counts
    })
    let requestEpoch = 0

    function selectionDetails(person) {
        if ((nameCounts.value.get(person.colab) || 0) < 2) return ''
        return (person.matricula ? 'Matrícula: ' + person.matricula + ' · ' : '') + 'Cadastro: ' + person.id
    }

    // Carrega colaboradores da API
    const loadColabs = async () => {
        const started = requestEpoch
        try {
            const res = await axios.get('/colab')
            if (started === requestEpoch) {
                colabs.value = res.data
                chkColabs.value = chkColabs.value.filter(id => colabs.value.some(person => person.id === id))
            }
        } catch {
            if (started === requestEpoch) toast.error('Não foi possível carregar os profissionais.', { theme: 'colored' })
        }
    }

    // Seleciona ou desmarca um colaborador
    function toggleColab(colabId) {
        const idx = chkColabs.value.indexOf(colabId)
        if (idx > -1) {
            chkColabs.value.splice(idx, 1)
        } else {
            chkColabs.value.push(colabId)
        }
    }

    // Seleciona todos os colaboradores
    function selectAllColabs() {
        chkColabs.value = colabs.value.map(c => c.id)
    }

    // Limpa todas as seleções
    function clearSelection() {
        chkColabs.value = []
    }

    function clearPrivateData() {
        requestEpoch++
        colabs.value = []
        clearSelection()
    }

    return {
        colabs,
        loadColabs,
        chkColabs,
        selectedColabs,
        selectionDetails,
        toggleColab,
        selectAllColabs,
        clearSelection,
        clearPrivateData
    }
})
