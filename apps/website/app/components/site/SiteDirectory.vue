<script setup lang="ts">
import type { ResolvedNavigationLink } from '~/features/navigation/model'
import AppIcon from '../AppIcon.vue'

defineProps<{ items: readonly ResolvedNavigationLink[] }>()
</script>

<template>
  <ul class="grid m-0 list-none gap-4 p-0 md:grid-cols-2">
    <li v-for="item in items" :key="item.id" class="min-w-0">
      <NuxtLink :to="item.to" class="group card-link h-full flex flex-col border border-line rounded-panel bg-surface p-5 md:p-6">
        <span class="flex items-center justify-between gap-4" aria-hidden="true">
          <span class="size-11 flex shrink-0 items-center justify-center rounded-button bg-accent-surface text-xl text-accent-soft"><AppIcon :name="item.icon" /></span>
          <AppIcon name="chevron" class="ui-feedback shrink-0 text-muted group-focus-visible:text-accent-soft group-hover:text-accent-soft" />
        </span>
        <h2 class="mt-5 break-words text-title text-heading font-semibold">
          {{ item.label }}
        </h2>
        <p v-if="item.description" class="mt-2 break-words text-sm text-muted leading-relaxed">
          {{ item.description }}
        </p>
      </NuxtLink>
    </li>
  </ul>
</template>
