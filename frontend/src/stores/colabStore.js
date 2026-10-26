import { defineStore } from 'pinia'
import { ref } from "vue"
import axios from '@/plugins/axios.js'
import { toast } from 'vue3-toastify'

export const useColabStore = defineStore('colabs', () => {
    const chkColabs = ref([])
    const colabs = ref([])
    let requestEpoch = 0

    // Carrega colaboradores da API
    const loadColabs = async () => {
        const started = requestEpoch
        try {
            const res = await axios.get('/colab')
            if (started === requestEpoch) colabs.value = res.data
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
        chkColabs.value = colabs.value.map(c => c.colab)
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
        toggleColab,
        selectAllColabs,
        clearSelection,
        clearPrivateData
    }
})
