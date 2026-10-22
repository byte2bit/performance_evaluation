// import { ref } from 'vue'

var currentUser = ""
var dados = {}

let parentUrl = document.referrer
let cUser = parentUrl.split("=")
// currentUser = cUser[1]
currentUser = "silvio.avaliacao"

switch (currentUser) {
    case "silvio.avaliacao":
        dados = {
            nome: "Silvio Ribeiro",
            email: "silvio.ribeiro@gmail.com",
            admin: true
        }
        break;
    case "yuri.avaliacao":
        dados = {
            nome: "Yuri Felipe",
            email: "yuri.felipe@nucleoengenharia.com.br",
            admin: true
        }
        break;
    case "fabiano.avaliacao":
        dados = {
            nome: "Fabiano Silva",
            email: "fabiano.silva@nucleoengenharia.com.br",
            admin: true
        }
        break;
    case "bernardo.avaliacao":
        dados = {
            nome: "Bernardo Santos",
            email: "bernardo.santos@nucleoengenharia.com.br",
            admin: true
        }
        break;
    case "mayconlacorte":
        dados = {
            nome: "Maycon Lacorte",
            email: "mayconlacorte@petrobras.com.br",
            admin: false
        }
        break;
    case "thiago.ramalho":
        dados = {
            nome: "Thiago Ramalho",
            email: "thiago.ramalho@petrobras.com.br",
            admin: false
        }
        break;
    case "elisangela.valdo":
        dados = {
            nome: "Elisangela Valdo",
            email: "elisangela.valdo@petrobras.com.br",
            admin: false
        }
        break;
    case "rodrigomrebello":
        dados = {
            nome: "Rodrigo Rebello",
            email: "rodrigomrebello@petrobras.com.br",
            admin: false
        }
        break;
    case "estevao.domingues":
        dados = {
            nome: "Estevão Domingues Costa",
            email: "estevao.domingues@petrobras.com.br",
            admin: false
        }
        break;
    default:
        dados = {
            nome: "Não localizado",
            email: "Não localizado",
        }
        break;
}

export { currentUser, dados }