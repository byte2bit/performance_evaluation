<script>
import axios from 'axios'
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
                gerencia: "",
                demandante: "",
            }
        }
    },
    components: {
        toast
    },
    methods: {
        notify: function () {
            toast.success("Dados registrados!", {
                autoClose: 1000,
                theme: 'colored',
            })
        },
        save: function () {
            axios.post("newcolab", this.postData)
                .then(() => {
                    this.reset()
                    // console.log(this.postData)
                    this.notify()
                })
                .catch(console.log("Erro"))
        },
        reset() {
            this.postData.matricula = "",
            this.postData.colab = ""
            this.postData.ppu = ""
            this.postData.servico = ""
            this.postData.funcao = ""
            this.postData.liderancas = ""
            this.postData.gerencia = ""
            this.postData.demandante = ""
        },
        // console.log(this.postData)
    },
}
</script>

<template>
    <div class="container">
        <h2 class="mt-5">Inserir Novo Profissional: </h2>
        <form class="form" @submit.prevent="save">
            <div class="row">
                <div class="col-sm-12 col-md-10">
                    <label for="profissional" class="form-label">Nome do candidato:</label><br>
                    <input type="text" class="form-control" id="profissional" v-model="postData.colab" />
                </div>
                <div class="col-sm-12 col-md-2">
                    <label for="profissional" class="form-label">Matrícula:</label><br>
                    <input type="text" class="form-control" id="profissional" v-model="postData.matricula" />
                </div>
                <div class="col-sm-12 col-md-2">
                    <label for="ppu" class="form-label">Item de PPU:</label><br>
                    <input type="text" class="form-control" id="ppu" v-model="postData.ppu" />
                </div>
                <div class="col-sm-12 col-md-10">
                    <label for="servico" class="form-label">Serviço:</label><br>
                    <input type="text" class="form-control" id="servico" v-model="postData.servico" />
                </div>
                <div class="col-sm-12 col-md-12">
                    <label for="funcao" class="form-label">Função:</label><br>
                    <input type="text" class="form-control" id="funcao" v-model="postData.funcao" />
                </div>
                <div class="col-sm-12 col-md-4">
                    <label for="liderancas" class="form-label">Lideranças:</label><br>
                    <input type="text" class="form-control" id="liderancas" v-model="postData.liderancas" />
                </div>
                <div class="col-sm-12 col-md-4">
                    <label for="gerencia" class="form-label">Gerência:</label><br>
                    <input type="text" class="form-control" id="gerencia" v-model="postData.gerencia" />
                </div>
                <div class="col-sm-12 col-md-4">
                    <label for="demandante" class="form-label">Demandante:</label><br>
                    <input type="text" class="form-control" id="demandante" v-model="postData.demandante" />
                </div>
            </div>
            <div class="border-top border-2 mt-5 pb-3 d-flex justify-content-between align-items-center">
                <router-link to="/" class="h5">Voltar</router-link>
                <button class="btn btn-primary btn-lg float-end mt-4">Enviar</button>
            </div>
        </form>
    </div>
</template>

<style lang="scss" scoped>
.container {
    max-width: 1000px !important;
    margin: auto;
}

@media(max-width: 768px) {
    .container {
        margin: 0;
    }
}

input {
    width: 100%;
    padding: 5px 10px;
    font-size: 14px;
}

.row div {
    margin: 20px 0;
}

label {
    font-weight: bold;
    font-size: 16px;
}
</style>