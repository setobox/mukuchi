<script setup lang="ts">
definePageMeta({ section: 'tools', pageKind: 'index', pageTitle: '工具', parentPath: '/my' })
useSeoMeta({ title: '工具', description: '实用工具。' })
</script>

<template>
  <div class="mx-auto max-w-[960px]">
    <PageHeading title="工具" />
    <p class="mb-8 text-muted">
      方便创作与日常使用的小工具。
    </p>
    <div class="grid gap-4">
      <NuxtLink to="/tools/cover" class="group card-link min-w-0 flex items-center gap-4 border border-line rounded-panel bg-surface p-5 md:gap-5 md:p-6">
        <span class="size-12 flex shrink-0 items-center justify-center rounded-button bg-accent-surface text-title text-accent-soft" aria-hidden="true">
          <AppIcon name="image" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-title text-heading font-medium">
            封面制作器
          </h2>
          <p class="mt-1 text-sm text-muted leading-relaxed">
            制作文章封面，支持 PNG、SVG 和 WebP 导出。
          </p>
        </div>
        <span class="ui-feedback flex shrink-0 items-center gap-2 text-sm text-muted group-focus-visible:text-accent-soft group-hover:text-accent-soft">
          <!-- <span class="hidden md:inline">打开工具</span> -->
          <AppIcon name="arrow" aria-hidden="true" />
        </span>
      </NuxtLink>
    </div>
  </div>
</template>
