<script setup>
import { RouterView, useRoute, useRouter } from 'vue-router'
import { watch } from 'vue'
import { useAuthStore } from '@/stores/authStore.js'
import Header from './template/Header.vue'
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
watch(() => auth.user, user => {
  if (!user && !route.meta.public) router.replace({ name: 'Login' })
})
</script>

<template>
  <div class="content">
    <header>
      <nav>
        <Header v-if="auth.user" />
      </nav>
    </header>
    <RouterView v-if="route.meta.public || auth.user" />
    <footer id="footer" class="bg-gray-800 text-center text-white text-sm m-0 p-1">&copy; Núcleo Engenharia </footer>
  </div>
</template>

<style lang="scss" scoped>
.content {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

#footer {
  margin-top: auto;
  flex-shrink: 0;
  width: 100%;
}
</style>
