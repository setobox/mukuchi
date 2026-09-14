<script setup lang="ts">
import type { TocLink } from '~/features/toc/model'

defineProps<{ items: TocLink[], activeId: string }>()
const emit = defineEmits<{ select: [id: string] }>()
</script>

<template>
  <nav aria-label="文章目录">
    <ul class="m-0 list-none border-l border-line p-0">
      <li v-for="item in items" :key="item.id">
        <a
          :href="`#${encodeURIComponent(item.id)}`"
          :aria-current="activeId === item.id ? 'location' : undefined"
          class="block min-h-10 border-l-2 py-2 pr-3 text-sm leading-6 transition-colors hover:text-heading"
          :class="
            activeId === item.id
              ? '-ml-px border-accent bg-accent-surface text-accent-soft'
              : '-ml-px border-transparent text-muted'
          "
          :style="{ paddingLeft: `${12 + (item.depth - 2) * 12}px` }"
          @click.prevent="emit('select', item.id)"
        >{{ item.text }}</a>
      </li>
    </ul>
  </nav>
</template>
