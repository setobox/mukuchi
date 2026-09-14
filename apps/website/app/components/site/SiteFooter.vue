<script setup lang="ts">
const { site } = useAppConfig();
</script>

<template>
  <footer class="site-container mt-auto">
    <div
      class="min-h-26 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line py-6 pr-11 text-muted"
    >
      <span class="text-ink leading-[normal] font-mono">{{ site.name }}</span>
      <NuxtLink to="/about" class="text-link">关于本站</NuxtLink>
    </div>
  </footer>
</template>
