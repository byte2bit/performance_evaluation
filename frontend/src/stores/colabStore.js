import { defineStore } from 'pinia'
import { ref } from "vue"
import axios from '@/plugins/axios.js'
import { toast } from 'vue3-toastify'

export const useColabStore = defineStore('colabs', () => {
    const chkColabs = ref([])
    const colabs = ref([])

    // Carrega colaboradores da API
    const loadColabs = async () => {
        try {
            const res = await axios.get('/colab')
            colabs.value = res.data
        } catch {
            toast.error('Não foi possível carregar os profissionais.', { theme: 'colored' })
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

    return {
        colabs,
        loadColabs,
        chkColabs,
        toggleColab,
        selectAllColabs,
        clearSelection
    }
})
