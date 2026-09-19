<script setup lang="ts">
definePageMeta({ section: 'tools', pageKind: 'index', pageTitle: '工具' })
useSeoMeta({ title: '工具', description: '实用工具。' })
</script>

<template>
  <div class="mx-auto max-w-[960px]">
    <h1 class="mb-4 text-xl text-heading font-semibold">
      工具
    </h1>
    <div class="grid gap-3 lg:grid-cols-4 md:grid-cols-3">
      <NuxtLink to="/tools/cover" class="group card-link min-w-0 border border-line rounded-panel bg-surface p-4">
        <div class="flex items-center justify-between gap-3" aria-hidden="true">
          <span class="size-8 flex items-center justify-center rounded-lg bg-accent-surface text-accent-soft"><AppIcon name="image" /></span>
          <AppIcon name="arrow" class="ui-feedback text-muted group-hover:text-accent-soft" />
        </div>
        <h2 class="mt-3 text-sm text-heading font-medium">
          封面制作器
        </h2>
        <p class="mt-1 text-xs text-muted leading-relaxed">
          制作文章封面，支持 PNG、SVG 和 WebP 导出。
        </p>
      </NuxtLink>
    </div>
  </div>
</template>
