<template>
    <header>
        <div class="flex justify-between items-center p-2 bg-white border-gray-200 dark:bg-gray-900">
            <img src="@/assets/logo-horizontal branco.png" class="h-6" alt="Núcleo Logo" />
            <a href="#" class="flex items-center space-x-3 rtl:space-x-reverse">
                <span class="self-center text-xl font-semibold whitespace-nowrap font-white dark:text-white">Núcleo
                    Avaliação de Nível de Serviço</span>
            </a>
            <div class="text-white me-6">
                <p class="mb-1 demandante">Nome: Nome do Demandante</p>
                <p class="demandante">Email: Email do Demandante</p>
                <!-- <p class="mb-1"><b>Nome: </b>{{ dados.nome }}</p>
                <p><b>Email: </b>{{ dados.email }}</p> -->
            </div>
        </div>
        <nav class="bg-gray-600 text-white">
            <div class="flex flex-wrap items-center justify-between 2xl:mx-auto px-4 py-2">

                <button data-collapse-toggle="navbar-default" type="button"
                    class="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-gray-500 rounded-lg md:hidden hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
                    aria-controls="navbar-default" aria-expanded="false">
                    <span class="sr-only">Abrir menu principal</span>
                    <svg class="w-5 h-5"  xmlns="http://www.w3.org/2000/svg" fill="none"
                        viewBox="0 0 17 14">
                        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M1 1h15M1 7h15M1 13h15" />
                    </svg>
                </button>

                <div class="hidden w-full md:block md:w-auto" id="navbar-default">
                    <ul
                        class="text-sm flex flex-col p-4 md:p-0 mt-4 border  text-white border-gray-100 rounded-lg md:flex-row md:space-x-8 rtl:space-x-reverse md:mt-0 md:border-0">
                        <li>
                            <a href="#"
                                class="block py-2 px-3 rounded-sm md:bg-transparent md:p-0 hover:text-yellow-200"
                                aria-current="page">
                                <router-link to="/">
                                    <svg class="ms-1 h-5 w-5 fill-white hover:fill-yellow-200"
                                        viewBox="0 0 576 512" alt="Início"><!--!Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2025 Fonticons, Inc.-->
                                        <path
                                            d="M575.8 255.5c0 18-15 32.1-32 32.1h-32l.7 160.2c0 2.7-.2 5.4-.5 8.1v16.2c0 22.1-17.9 40-40 40h-16c-1.1 0-2.2 0-3.3-.1-1.4.1-2.8.1-4.2.1L416 512h-24c-22.1 0-40-17.9-40-40v-88c0-17.7-14.3-32-32-32h-64c-17.7 0-32 14.3-32 32v88c0 22.1-17.9 40-40 40h-55.9c-1.5 0-3-.1-4.5-.2-1.2.1-2.4.2-3.6.2h-16c-22.1 0-40-17.9-40-40V360c0-.9 0-1.9.1-2.8v-69.7h-32c-18 0-32-14-32-32.1 0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7l255.4 224.5c8 7 12 15 11 24z" />
                                    </svg>
                                </router-link>
                            </a>
                        </li>
                        <li>
                            <a href="#"
                                class="block py-2 px-3 rounded-sm md:bg-transparent md:p-0 hover:text-yellow-200"
                                aria-current="page">
                                <router-link to="/registros">Registros</router-link>
                            </a>
                        </li>
                        <li>
                            <a href="#"
                                class="block py-2 px-3 text-white rounded-sm md:border-0 hover:text-yellow-200 md:p-0  ">
                                <!-- class="block py-2 px-3 text-white rounded-sm hover:bg-blue-900  md:border-0 md:hover:text-yellow-200 md:p-0  "> -->
                                <!-- <router-link v-if="admin" to="/colabs">Lista de profissionais</router-link> -->
                                <router-link to="/colabs">Lista de profissionais</router-link>
                            </a>
                        </li>
                        <li>
                            <a href="#"
                                class="block py-2 px-3 text-white rounded-sm  md:border-0 hover:text-yellow-200 md:p-0  ">
                                <!-- <router-link v-if="admin" to="/inserir">Inserir profissional</router-link> -->
                                <router-link to="/inserir">Inserir profissional</router-link>
                            </a>
                        </li>

                    </ul>
                </div>
            </div>
        </nav>

    </header>
</template>

<script setup>
// import { dados } from '../../js/store.js'


</script>

<style lang="scss" scoped>

header {

    p {
        margin-bottom: 4px;
        font-size: 0.7rem;
    }
}

#logo img {
    max-width: 120px;
}

@media(max-width: 768px) {
    #logo {
        text-align: center;
        margin-bottom: 25px;
    }

    .head div {
        margin-bottom: 15px;
    }
}
.demandante {
    font-size: 0.6rem;
}
</style>