<script>
import axios from 'axios'
import exportFromJSON from "export-from-json"
import { excelParser } from "../utils/excel-parser"
import { dados } from '../../js/store.js'

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
            axios.get("registros")
                .then(res => {
                    this.listData = res.data

                    this.colabcUser = this.listData.filter(registro => registro.demandante === dados.email)

                    var data = this.listData.map((registro => {
                        let a = registro.created_at.split("T")[0]
                        let d = a.split("-")
                        let dat = d[2] + "/" + d[1] + "/" + d[0]

                        registro.created_at = dat

                        return (registro.created_at)
                    }))

                }).catch("Erro")
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

        <button class="btn btn-primary btn-sm" @click="exportData">Exportar XLS</button>
        
    </div>
</template>
<style lang="scss" scoped>  
button{
    width: 100px;
}
</style>