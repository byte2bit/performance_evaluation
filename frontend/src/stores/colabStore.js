import { defineStore } from 'pinia'
import { ref } from "vue"
import axios from 'axios'

export const useColabStore = defineStore('colabs', () => {
    const chkColabs = ref([])
    const colabs = ref([])

    // Carrega colaboradores da API
    const loadColabs = async () => {
        try {
            const res = await axios.get("https://api.nucleoengenharia.com.br:8000/colab")
            colabs.value = res.data
        } catch (e) {
            console.error("Erro ao carregar colaboradores", e)
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
