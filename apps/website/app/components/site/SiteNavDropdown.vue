<script setup lang="ts">
import type { ResolvedNavigationItem } from '~/features/navigation/model'
import { onClickOutside, useEventListener, useTimeoutFn } from '@vueuse/core'
import { nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{ item: ResolvedNavigationItem, resetKey: string }>()
const open = defineModel<boolean>('open', { required: true })
const root = useTemplateRef<HTMLElement>('root')
const panel = useTemplateRef<HTMLElement>('panel')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const panelId = useId()
const suppressHover = ref(false)
const opening = useTimeoutFn(() => open.value = true, 150, { immediate: false })
const closing = useTimeoutFn(() => {
  if (!root.value?.contains(document.activeElement))
    open.value = false
}, 200, { immediate: false })

function stopTimers() {
  opening.stop()
  closing.stop()
}
function close() {
  stopTimers()
  open.value = false
}
function enter(event: PointerEvent) {
  if (event.pointerType !== 'mouse')
    return
  closing.stop()
  if (!suppressHover.value)
    opening.start()
}
function leave(event: PointerEvent) {
  if (event.pointerType !== 'mouse')
    return
  suppressHover.value = false
  opening.stop()
  closing.start()
}
function toggle() {
  stopTimers()
  suppressHover.value = open.value
  open.value = !open.value
}
function focusOut(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget))
    close()
}
async function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    event.stopPropagation()
    suppressHover.value = true
    close()
    trigger.value?.focus({ preventScroll: true })
  }
  else if (event.key === 'ArrowDown' && !panel.value?.contains(event.target as Node)) {
    event.preventDefault()
    stopTimers()
    open.value = true
    await nextTick()
    panel.value?.querySelector<HTMLAnchorElement>('a[href]')?.focus({ preventScroll: true })
  }
}
onClickOutside(root, close)
useEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !event.defaultPrevented && open.value)
    void keydown(event)
})
useEventListener('focusin', (event) => {
  if (event.target instanceof Node && !root.value?.contains(event.target))
    close()
})
watch(() => props.resetKey, () => {
  suppressHover.value = false
  close()
})
watch(open, value => value && stopTimers())
</script>

<template>
  <div ref="root" class="relative" :data-navigation-id="item.id" @pointerenter="enter" @pointerleave="leave" @focusout="focusOut" @keydown="keydown">
    <div class="control-quiet flex items-center" :class="item.active || open ? 'control-selected' : 'text-muted'">
      <button
        ref="trigger" type="button" class="control-base size-11 shrink-0 focus-visible:bg-accent-pressed"
        :aria-label="`${open ? '收起' : '展开'}${item.label}子菜单`" :aria-expanded="open" :aria-controls="panelId"
        @click="toggle"
      >
        <AppIcon :name="item.icon" />
      </button>
      <NuxtLink :to="item.to" :aria-current="item.current" class="control-base min-w-11 pl-0 pr-3 focus-visible:bg-accent-pressed" :class="{ 'font-semibold': item.active }" @click="close">
        {{ item.label }}
      </NuxtLink>
    </div>
    <Transition name="nav-dropdown">
      <div v-show="open" :id="panelId" ref="panel" :inert="!open" class="absolute right-0 top-full max-w-[calc(100vw-40px)] w-56 pt-2">
        <ul class="m-0 max-h-[calc(100dvh-var(--header-height)-24px)] list-none overflow-y-auto overscroll-contain border border-line-strong rounded-panel bg-surface p-1.5 shadow-floating">
          <li v-for="child in item.children" :key="child.id">
            <NuxtLink
              :to="child.to" :aria-current="child.current"
              class="control-quiet min-h-11 flex items-center gap-3 px-3 py-2"
              :class="child.active ? 'control-selected font-medium' : 'text-muted'" @click="close"
            >
              <AppIcon :name="child.icon" class="shrink-0" />
              <span class="min-w-0 flex-1 break-words">{{ child.label }}</span>
              <AppIcon v-if="child.active" name="check" class="size-4 shrink-0" />
            </NuxtLink>
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.nav-dropdown-enter-active,
.nav-dropdown-leave-active {
  transition: opacity var(--duration-interaction) var(--ease-interaction), transform var(--duration-interaction) var(--ease-interaction);
}
.nav-dropdown-leave-active { pointer-events: none; }
.nav-dropdown-enter-from,
.nav-dropdown-leave-to { opacity: 0; transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) {
  .nav-dropdown-enter-active,
  .nav-dropdown-leave-active { transition: none; }
}
</style>
