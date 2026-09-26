<script setup lang="ts">
import type { ResolvedNavigationItem } from '~/features/navigation/model'
import { ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import SiteNavDropdown from './SiteNavDropdown.vue'

const props = defineProps<{ items: readonly ResolvedNavigationItem[], resetKey: string }>()
const openId = ref<string | null>(null)
function update(id: string, value: boolean) {
  // A pointer passing over another group must not remove the keyboard's focused link.
  if (value && openId.value !== id && document.activeElement?.closest('[data-navigation-id]')?.getAttribute('data-navigation-id') === openId.value)
    return
  if (value)
    openId.value = id
  else if (openId.value === id)
    openId.value = null
}
watch(() => props.resetKey, () => openId.value = null)
</script>

<template>
  <nav aria-label="主导航">
    <ul class="m-0 flex list-none items-center gap-1 p-0 text-s">
      <li v-for="item in items" :key="item.id">
        <SiteNavDropdown v-if="item.children.length" :item="item" :open="openId === item.id" :reset-key="resetKey" @update:open="update(item.id, $event)" />
        <NuxtLink
          v-else :to="item.to" :aria-current="item.current"
          class="control-base control-quiet px-3" :class="item.active ? 'control-selected font-semibold' : 'text-muted'"
        >
          <AppIcon :name="item.icon" class="shrink-0" />
          {{ item.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
