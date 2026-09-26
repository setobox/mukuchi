<script setup lang="ts">
import type { ResolvedNavigationItem } from '~/features/navigation/model'
import { ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import BaseCollapsible from '../base/BaseCollapsible.vue'

const props = defineProps<{ items: readonly ResolvedNavigationItem[], open: boolean }>()
const emit = defineEmits<{ navigate: [] }>()
const expandedIds = ref<string[]>([])
watch(() => props.open, (open) => {
  if (open)
    expandedIds.value = props.items.filter(item => item.active && item.children.length).map(item => item.id)
}, { immediate: true })
function expand(id: string, open: boolean) {
  expandedIds.value = open ? [...new Set([...expandedIds.value, id])] : expandedIds.value.filter(value => value !== id)
}
function escape(event: KeyboardEvent, id: string) {
  if (event.key !== 'Escape' || !expandedIds.value.includes(id))
    return
  event.preventDefault()
  event.stopPropagation()
  expand(id, false)
  ;(event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('button[aria-expanded]')?.focus({ preventScroll: true })
}
</script>

<template>
  <nav aria-label="移动导航">
    <ul class="m-0 flex flex-col list-none gap-2 p-0 text-s">
      <li v-for="item in items" :key="item.id" @keydown="escape($event, item.id)">
        <BaseCollapsible v-if="item.children.length" :open="expandedIds.includes(item.id)" @update:open="expand(item.id, $event)">
          <template #leading>
            <NuxtLink :to="item.to" :aria-current="item.current" class="control-quiet min-h-14 min-w-0 flex flex-1 items-center gap-3 px-4 py-3" :class="item.active ? 'control-selected font-medium' : 'text-muted'" @click="emit('navigate')">
              <AppIcon :name="item.icon" class="shrink-0" /><span class="min-w-0 break-words">{{ item.label }}</span>
            </NuxtLink>
          </template>
          <template #trigger="{ open: expanded }">
            <button type="button" class="icon-button ml-1 size-14!" :class="{ 'text-accent-soft!': item.active }" :aria-label="`${expanded ? '收起' : '展开'}${item.label}子菜单`">
              <AppIcon name="down" class="transition-transform duration-[var(--duration-interaction)] motion-reduce:transition-none" :class="{ 'rotate-180': expanded }" />
            </button>
          </template>
          <ul class="mb-2 ml-6 mr-2 mt-1 list-none border-l border-line-strong py-1 pl-3">
            <li v-for="child in item.children" :key="child.id">
              <NuxtLink :to="child.to" :aria-current="child.current" class="control-quiet min-h-12 flex items-center gap-3 px-3 py-2.5" :class="child.active ? 'control-selected font-medium' : 'text-muted'" @click="emit('navigate')">
                <AppIcon :name="child.icon" class="shrink-0" /><span class="min-w-0 flex-1 break-words">{{ child.label }}</span><AppIcon v-if="child.active" name="check" class="size-4 shrink-0" />
              </NuxtLink>
            </li>
          </ul>
        </BaseCollapsible>
        <NuxtLink v-else :to="item.to" :aria-current="item.current" class="control-quiet min-h-14 flex items-center gap-3 px-4 py-3" :class="item.active ? 'control-selected font-medium' : 'text-muted'" @click="emit('navigate')">
          <AppIcon :name="item.icon" class="shrink-0" /><span class="min-w-0 break-words">{{ item.label }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
