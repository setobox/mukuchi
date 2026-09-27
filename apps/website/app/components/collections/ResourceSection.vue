<script setup lang="ts">
import type { ResourceGroup } from '#shared/collections/types'
import { useTemplateRef } from 'vue'
import { useResourceMotion } from '~/features/collections/motion'

defineProps<{ group: ResourceGroup }>()
useResourceMotion(useTemplateRef<HTMLElement>('root'))
</script>

<template>
  <section ref="root">
    <h2 class="border-b border-line pb-4 text-section text-heading">
      {{ group.title }}
    </h2>
    <ul v-if="group.items.length" class="grid m-0 list-none gap-x-8 p-0 lg:grid-cols-3 md:grid-cols-2">
      <li v-for="(item, index) in group.items" :key="`${index}:${item.href}`" class="min-w-0 border-b border-line">
        <ResourceLinkCard :item="item" />
      </li>
    </ul>
    <p v-else class="border-b border-line py-6 text-sm text-muted">
      暂无条目。
    </p>
  </section>
</template>
