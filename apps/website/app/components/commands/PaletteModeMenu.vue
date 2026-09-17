<script setup lang="ts">
import type { PaletteFeatures, PaletteMode } from '~/features/commands/controller'
import { onClickOutside } from '@vueuse/core'
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'

const props = defineProps<{ mode: PaletteMode, features: PaletteFeatures, active: boolean }>()
const emit = defineEmits<{ select: [mode: PaletteMode], openChange: [open: boolean] }>()
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')
const menu = useTemplateRef<HTMLElement>('menu')
const menuId = useId()
const open = ref(false)
const options = computed(() => [
  { mode: 'search' as const, label: '搜索文章', icon: 'notebook' as const },
  { mode: 'commands' as const, label: '执行命令', icon: 'terminal' as const },
].filter(option => props.features[option.mode]))

watch(open, value => emit('openChange', value))
watch(() => [props.active, props.mode, props.features.search, props.features.commands], () => close(false))
onClickOutside(root, () => close(false))

function close(restoreFocus: boolean) {
  if (!open.value)
    return
  open.value = false
  if (restoreFocus)
    trigger.value?.focus({ preventScroll: true })
}

async function show(last = false) {
  if (options.value.length < 2)
    return
  open.value = true
  await nextTick()
  const items = menu.value?.querySelectorAll<HTMLButtonElement>('button')
  const index = last ? options.value.length - 1 : Math.max(0, options.value.findIndex(option => option.mode === props.mode))
  items?.[index]?.focus({ preventScroll: true })
}

function triggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    void show(event.key === 'ArrowUp')
  }
}

function menuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close(true)
    return
  }
  const items = [...(menu.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
  const index = items.findIndex(item => item === document.activeElement)
  let next: number
  if (event.key === 'ArrowDown')
    next = (index + 1) % items.length
  else if (event.key === 'ArrowUp')
    next = (index - 1 + items.length) % items.length
  else if (event.key === 'Home')
    next = 0
  else if (event.key === 'End')
    next = items.length - 1
  else
    return
  event.preventDefault()
  event.stopPropagation()
  items[next]?.focus({ preventScroll: true })
}

function focusout(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget))
    close(false)
}

function select(mode: PaletteMode) {
  close(false)
  emit('select', mode)
}
</script>

<template>
  <div ref="root" class="relative shrink-0 text-[16px] leading-6" @focusout="focusout">
    <button
      ref="trigger" type="button" class="relative h-11 min-w-16 flex items-center border border-line-strong rounded-button bg-canvas pl-3 pr-10 text-muted hover:border-muted hover:text-heading"
      :aria-label="`切换模式，当前${mode === 'search' ? '搜索文章' : '执行命令'}`"
      :disabled="options.length < 2" :aria-expanded="open" aria-haspopup="menu" :aria-controls="menuId"
      @click="open ? close(true) : show()" @keydown="triggerKeydown"
    >
      <AppIcon v-if="mode === 'search'" name="search" />
      <span v-else aria-hidden="true" class="w-[1.1em] text-center font-mono">&gt;</span>
      <AppIcon v-if="options.length > 1" name="down" class="pointer-events-none absolute right-3 top-1/2 size-4! -translate-y-1/2" />
    </button>
    <div
      v-if="open" :id="menuId" ref="menu" role="menu" aria-label="切换面板模式"
      class="absolute left-0 top-full z-10 mt-1.5 w-44 border border-line-strong rounded-button bg-surface p-1 shadow-floating"
      @keydown="menuKeydown"
    >
      <button
        v-for="option in options" :key="option.mode" type="button" role="menuitemradio" :aria-checked="mode === option.mode" tabindex="-1"
        class="min-h-11 w-full flex items-center gap-2 rounded-md px-3 text-left focus-visible:bg-accent-surface hover:bg-accent-surface"
        :class="mode === option.mode ? 'text-accent-soft' : 'text-heading'"
        @click="select(option.mode)"
      >
        <AppIcon :name="option.icon" /><span class="flex-1">{{ option.label }}</span><AppIcon v-if="mode === option.mode" name="check" class="size-4!" />
      </button>
    </div>
  </div>
</template>
