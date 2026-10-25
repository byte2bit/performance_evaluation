<script setup>
import { RouterView } from 'vue-router'
import Header from './template/Header.vue'
</script>

<template>
  <div class="content">
    <header>
      <nav>
        <Header />
      </nav>
    </header>
    <RouterView />
    <footer id="footer" class="bg-gray-800 text-center text-white text-sm m-0 p-1">&copy; Núcleo Engenharia </footer>
  </div>
</template>

<style lang="scss" scoped>
.content {
  min-width: 100vw;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

header {
  grid-column: 1 / -1;
}

#footer {
  // border: 1px solid black;
  grid-column: 1 / -1;
  position: fixed;
  bottom: 0;
  width: 100%;
}
</style>
