<script setup lang="ts">
const { site } = useAppConfig()
</script>

<template>
  <footer class="relative z-0 mt-auto border-t border-line bg-canvas">
    <div class="site-container py-6">
      <div
        class="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-center text-sm text-muted"
      >
        <span>2020 - PRESENT © {{ site.name.toUpperCase() }}</span>
        <a
          href="https://icp.gov.moe/?keyword=20232190"
          target="_blank"
          rel="noreferrer"
          class="min-h-11 inline-flex items-center transition-colors hover:text-heading"
        >
          萌ICP备20232190号
        </a>
      </div>
    </div>
  </footer>
</template>
