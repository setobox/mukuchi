<script setup lang="ts">
import type { NavigationFailure, RouteLocationRaw } from 'vue-router'
import { computed } from 'vue'
import { postPageNumbers } from '~/features/posts/pagination'

const props = defineProps<{
  page: number
  pageCount: number
  location: (page: number) => RouteLocationRaw
}>()
const emit = defineEmits<{ navigate: [] }>()
const items = computed(() => [
  { label: '上一页', page: props.page > 1 ? props.page - 1 : null, rel: 'prev' },
  ...postPageNumbers(props.page, props.pageCount).map(page => ({
    label: page === 'ellipsis' ? '…' : `第 ${page} 页`,
    page: page === 'ellipsis' ? null : page,
    rel: undefined,
  })),
  { label: '下一页', page: props.page < props.pageCount ? props.page + 1 : null, rel: 'next' },
])

async function follow(event: MouseEvent, navigate: (event: MouseEvent) => Promise<void | NavigationFailure>) {
  const active = !event.defaultPrevented && event.button === 0
    && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  const failure = await navigate(event)
  if (active && !failure)
    emit('navigate')
}
</script>

<template>
  <nav v-if="pageCount > 1" aria-label="文章分页" class="mt-8 border-t border-line pt-6">
    <ul class="m-0 flex flex-wrap list-none items-center justify-center gap-2 p-0">
      <li v-for="(item, index) in items" :key="item.rel ?? index">
        <NuxtLink v-if="item.page !== null" v-slot="{ href, navigate }" :to="location(item.page)" custom>
          <a
            :href="href ?? undefined"
            :rel="item.rel"
            :aria-label="item.label"
            :aria-current="!item.rel && item.page === page ? 'page' : undefined"
            :title="item.label"
            class="icon-button border border-line-strong"
            :class="{ 'control-selected': !item.rel && item.page === page }"
            @click="follow($event, navigate)"
          >
            <AppIcon v-if="item.rel" name="chevron" :class="{ 'rotate-180': item.rel === 'prev' }" />
            <span v-else>{{ item.page }}</span>
          </a>
        </NuxtLink>
        <span
          v-else
          :role="item.rel ? 'link' : undefined"
          :aria-disabled="item.rel ? 'true' : undefined"
          :aria-hidden="!item.rel ? 'true' : undefined"
          :aria-label="item.rel ? item.label : undefined"
          :title="item.rel ? item.label : undefined"
          class="control-base h-11 w-11 text-muted"
          :class="{ 'border border-line-strong': item.rel }"
        >
          <AppIcon v-if="item.rel" name="chevron" :class="{ 'rotate-180': item.rel === 'prev' }" />
          <span v-else>…</span>
        </span>
      </li>
    </ul>
  </nav>
</template>
