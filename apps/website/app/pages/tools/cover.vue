<script setup lang="ts">
definePageMeta({ section: 'tools', pageKind: 'index', pageTitle: '封面制作器' })
useSeoMeta({ title: '封面制作器', description: '调整文字、图标和画布，制作并下载 PNG、SVG、WebP 文章封面。' })
</script>

<template>
  <div class="mx-auto max-w-[640px] lg:max-w-[960px]">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h1 class="text-xl text-heading font-semibold">
        封面制作器
      </h1>
      <NuxtLink to="/tools" class="text-link min-h-11 inline-flex items-center text-sm">
        <AppIcon name="left" />返回工具
      </NuxtLink>
    </div>
    <LazyCoverMaker />
  </div>
</template>
