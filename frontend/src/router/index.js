import { createWebHistory, createRouter } from "vue-router"
import { useAuthStore } from '@/stores/authStore.js'
import { createAuthGuard } from './authGuard.js'


// import Home from '@/components/pages/Home.vue'
const Home = () => import(/* webpackChunkName: "main" */ '@/components/pages/Home.vue')

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
    { path: '/login', name: 'Login', component: () => import('@/components/pages/Login.vue'), meta: { public: true } },
    { path: '/senha', name: 'Senha', component: () => import('@/components/pages/ChangePassword.vue') },
    {
        path: "/",
        name: "Form",
        component: Home,
    },
    {
        path: "/inserir",
        name: "Inserir",
        meta: { admin: true },
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
        meta: { admin: true },
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

router.beforeEach(createAuthGuard(() => useAuthStore()));

export default router;
