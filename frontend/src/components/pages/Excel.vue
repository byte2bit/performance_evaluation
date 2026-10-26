<script>
import axios from '@/plugins/axios.js'
import exportFromJSON from "export-from-json"
import { excelParser } from "../utils/excel-parser"
import { dados } from '../../js/store.js'
import { toast } from 'vue3-toastify'

export default {
    data() {
        return {
            admin: dados.admin,
            dados: {},
            colabcUser: [],
            listData: [],
        }
    },
    component: {
        exportFromJSON, 
        excelParser,
        dados
    },
    methods: {
        loadRegs() {
            return axios.get('/registros')
                .then(res => {
                    this.listData = res.data

                    this.colabcUser = this.listData

                    var data = this.listData.map((registro => {
                        let a = registro.created_at.split("T")[0]
                        let d = a.split("-")
                        let dat = d[2] + "/" + d[1] + "/" + d[0]

                        registro.created_at = dat

                        return (registro.created_at)
                    }))

                }).catch(() => {
                    toast.error('Não foi possível carregar os dados para exportação.', { theme: 'colored' })
                })
        },
        exportData() {
            excelParser().exportDataFromJSON(this.listData, null, null);
        },
    },
    mounted() {
        this.loadRegs()
    }
}
</script>

<template>
    <div v-if="admin" id="exportar">

        <button type="button" class="mp-button mp-button-secondary" @click="exportData">Exportar XLS</button>
        
    </div>
</template>
<style scoped>
button { min-height: 44px; padding: 10px 18px; border: 1px solid #cbd5e1; border-radius: 9px; font-size: 14px; font-weight: 600; cursor: pointer; }
</style>
