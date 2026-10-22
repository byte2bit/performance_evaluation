import { createWebHistory, createRouter } from "vue-router"


// import Form from '@/components/pages/Form.vue'
const Form = () => import(/* webpackChunkName: "main" */ '@/components/pages/Form.vue')

// import Inserir from "@/components/pages/Inserir.vue"
const Inserir = () => import(/* webpackChunkName: "inserir" */ '@/components/pages/Inserir.vue')

// import Registros from "@/components/pages/Registros.vue"
const Registros = () => import(/* webpackChunkName: "registros" */ '@/components/pages/Registros.vue')

// import Colabs from "@/components/pages/Colabs.vue"
const Colabs = () => import(/* webpackChunkName: "colabs" */ '@/components/pages/Colabs.vue')

// import Charts from "@/components/utils/Charts.vue"

// import Excel from "@/components/pages/Excel.vue"
const Excel = () => import(/* webpackChunkName: "excel" */ '@/components/pages/Excel.vue')
const CheckAll = () => import(/* webpackChunkName: "checkall" */ '@/components/utils/CheckAll.vue')


const routes = [
    {
        path: "/",
        name: "Form",
        component: Form,
    },
    {
        path: "/inserir",
        name: "Inserir",
        component: Inserir,
    },
    {
        path: "/registros",
        name: "Registros",
        component: Registros,
    },
    {
        path: "/colabs",
        name: "Colabs",
        component: Colabs,
    },
    /*     {
            path: "/charts",
            name: "Charts",
            component: Charts,
        }, */
    {
        path: "/excel",
        name: "Excel",
        component: Excel,
    },
    {
        path: "/checkall",
        name: "CheckAll",
        component: CheckAll,
    },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;