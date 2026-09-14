<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <header class="pb-9 text-right lg:pb-12">
    <h1 class="break-words text-page text-heading tracking-[-1px]">
      {{ title }}
    </h1>
  </header>
</template>
