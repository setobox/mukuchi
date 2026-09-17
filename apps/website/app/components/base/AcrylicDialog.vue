<script setup lang="ts">
import { useElementBounding, usePreferredReducedMotion, useScrollLock, useWindowSize } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { overlayTargetKey } from '~/shared/overlay'

const props = withDefaults(
  defineProps<{ title: string, description?: string, placement?: 'default' | 'image' | 'commands' | 'drawer' | 'editor', dismissible?: boolean }>(),
  { placement: 'default', dismissible: true },
)
const emit = defineEmits<{ opened: [], closed: [], keydown: [event: KeyboardEvent] }>()
const open = defineModel<boolean>({ default: false })
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
provide(overlayTargetKey, dialog)
const panel = useTemplateRef<HTMLElement>('panel')
const trigger = useTemplateRef<HTMLElement>('trigger')
const triggerPosition = useElementBounding(trigger)
const modalActive = ref(false)
const drawerExpanded = ref(false)
let openingFrame = 0
let transitionId = 0
const triggerStyle = computed(() => modalActive.value
  ? { position: 'fixed' as const, left: `${triggerPosition.left.value}px`, top: `${triggerPosition.top.value}px`, zIndex: 1 }
  : undefined)
const titleId = useId()
const descriptionId = useId()
const reducedMotion = usePreferredReducedMotion()
const { height: visualHeight } = useWindowSize({ type: 'visual', initialHeight: 0 })
const body = shallowRef<HTMLElement | null>(null)
const locked = useScrollLock(body)
let returnFocus: HTMLElement | null = null
let exitAnimation: Animation | undefined
const backdropPressed = ref(false)

function onKeydown(event: KeyboardEvent) {
  keepFocusInside(event)
  emit('keydown', event)
}

function isBackdrop(event: MouseEvent) {
  if (!dialog.value || event.target !== dialog.value)
    return false
  if (props.placement === 'drawer')
    return true
  const rect = dialog.value.getBoundingClientRect()
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
}

function keepFocusInside(event: KeyboardEvent) {
  const element = dialog.value
  if (event.defaultPrevented || event.key !== 'Tab' || !element)
    return
  const controls = Array.from(
    element.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
    ),
  ).filter(control => control.getClientRects().length > 0 && !control.closest('[inert]'))
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) {
    event.preventDefault()
    element.focus()
  }
  else if (
    event.shiftKey
    && (document.activeElement === first || document.activeElement === element)
  ) {
    event.preventDefault()
    last.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function closeOnBackdrop(event: MouseEvent) {
  if (props.dismissible && backdropPressed.value && isBackdrop(event)) {
    open.value = false
  }
  backdropPressed.value = false
}

onMounted(() => {
  body.value = document.body
  watch(
    open,
    async (value) => {
      const currentTransition = ++transitionId
      const element = dialog.value
      if (!element)
        return
      cancelAnimationFrame(openingFrame)
      exitAnimation?.cancel()
      if (value) {
        if (!element.open) {
          returnFocus
            = document.activeElement instanceof HTMLElement ? document.activeElement : null
          modalActive.value = true
          await nextTick()
          if (!open.value || currentTransition !== transitionId)
            return
          element.showModal()
          locked.value = true
          if (props.placement === 'drawer')
            element.querySelector<HTMLButtonElement>('[data-dialog-trigger] button')?.focus({ preventScroll: true })
          emit('opened')
        }
        if (props.placement === 'drawer') {
          if (reducedMotion.value === 'reduce') {
            drawerExpanded.value = true
          }
          else {
            // Keep one painted menu frame after moving the trigger into the modal layer.
            openingFrame = requestAnimationFrame(() => {
              openingFrame = requestAnimationFrame(() => {
                if (open.value && currentTransition === transitionId)
                  drawerExpanded.value = true
              })
            })
          }
        }
        return
      }
      if (!element.open) {
        modalActive.value = false
        return
      }
      if (props.placement === 'drawer') {
        drawerExpanded.value = false
        await nextTick()
        if (reducedMotion.value !== 'reduce')
          await Promise.all(panel.value?.getAnimations().map(animation => animation.finished.catch(() => undefined)) ?? [])
      }
      else if (reducedMotion.value !== 'reduce') {
        exitAnimation = element.animate(
          [
            { opacity: 1, transform: 'translateY(0)' },
            { opacity: 0, transform: 'translateY(-8px)' },
          ],
          { duration: 140, easing: 'ease-in' },
        )
        await exitAnimation.finished.catch(() => undefined)
      }
      if (!open.value && currentTransition === transitionId) {
        element.close()
        locked.value = false
        modalActive.value = false
        await nextTick()
        if (returnFocus?.isConnected)
          returnFocus.focus({ preventScroll: true })
        emit('closed')
      }
    },
    { immediate: true },
  )
})

onBeforeUnmount(() => {
  transitionId++
  cancelAnimationFrame(openingFrame)
  exitAnimation?.cancel()
  dialog.value?.close()
  locked.value = false
})
</script>

<template>
  <span v-if="$slots.trigger" ref="trigger" class="size-11 inline-flex shrink-0">
    <Teleport :to="dialog ?? 'body'" :disabled="!modalActive">
      <span data-dialog-trigger class="size-11 inline-flex" :style="triggerStyle">
        <slot name="trigger" :open="open" :expanded="drawerExpanded" :toggle="() => open = !open" />
      </span>
    </Teleport>
  </span>
  <Teleport to="body">
    <dialog
      ref="dialog"
      :style="placement === 'commands' && visualHeight > 0 ? { '--dialog-viewport-height': `${visualHeight}px` } : undefined"
      class="acrylic-dialog text-ink"
      :data-expanded="drawerExpanded"
      :class="[
        placement === 'drawer'
          ? 'acrylic-drawer fixed inset-0 m-0 h-dvh max-h-dvh w-full max-w-none overflow-clip border-0 rounded-none bg-transparent p-0'
          : 'mx-auto mb-auto border border-line-strong rounded-[20px] bg-acrylic shadow-dialog backdrop-blur-[24px]',
        placement === 'image'
          ? 'mt-4 h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-site overflow-hidden p-3 [&[open]]:flex flex-col gap-3'
          : placement === 'commands'
            ? 'mt-[min(var(--header-height),calc(var(--dialog-viewport-height,100dvh)*0.08))] w-[min(640px,calc(100vw-32px))] max-h-[calc(var(--dialog-viewport-height,100dvh)-32px-min(var(--header-height),calc(var(--dialog-viewport-height,100dvh)*0.08)))] overflow-hidden p-4 md:p-6 [&[open]]:flex flex-col'
            : placement === 'drawer'
              ? ''
              : placement === 'editor'
                ? 'my-4 w-[min(1440px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-auto [scrollbar-gutter:stable] p-4 md:p-6'
                : 'mt-[calc(var(--header-height)+14px)] w-[min(480px,calc(100vw-40px))] max-h-[calc(100dvh-100px)] overflow-auto [scrollbar-gutter:stable] p-6',
      ]"
      tabindex="-1"
      :autofocus="placement === 'drawer' || undefined"
      :aria-labelledby="titleId"
      :aria-describedby="description ? descriptionId : undefined"
      @cancel.prevent="dismissible && (open = false)"
      @keydown="onKeydown"
      @pointerdown="backdropPressed = isBackdrop($event)"
      @click="closeOnBackdrop"
      @close="open = false"
    >
      <div v-if="placement === 'drawer'" class="drawer-scrim pointer-events-none absolute inset-0 bg-scrim backdrop-blur-[5px]" aria-hidden="true" />
      <div
        ref="panel"
        :class="placement === 'drawer'
          ? 'drawer-panel absolute inset-y-0 right-0 w-[min(320px,calc(100vw-64px))] overflow-y-auto overscroll-contain border-l border-line-strong bg-acrylic pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-4 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(var(--header-height),env(safe-area-inset-top))] shadow-dialog backdrop-blur-[24px]'
          : 'contents'"
      >
        <header v-if="placement === 'drawer'" class="flex justify-end">
          <h2 :id="titleId" class="sr-only">
            {{ title }}
          </h2>
          <button v-if="!$slots.trigger" type="button" class="icon-button" aria-label="关闭导航" @click="open = false">
            <AppIcon name="close" />
          </button>
        </header>
        <header v-else class="flex shrink-0 items-start justify-between gap-2">
          <div class="min-w-0" :class="{ 'self-center': placement === 'image' }">
            <h2 :id="titleId" class="text-heading" :class="placement === 'commands' ? 'mt-1 text-[18px] leading-7' : placement === 'image' ? 'text-s' : 'mt-1 text-[22px]'">
              {{ title }}
            </h2>
            <p v-if="description" :id="descriptionId" class="mt-2 text-base text-muted">
              {{ description }}
            </p>
          </div>
          <div class="flex shrink-0 gap-1">
            <slot name="actions" />
            <button type="button" class="icon-button" aria-label="关闭弹窗" :disabled="!dismissible" @click="open = false">
              <AppIcon name="close" />
            </button>
          </div>
        </header>
        <div :class="placement === 'commands' ? 'min-h-0 flex flex-1 flex-col pt-4' : placement === 'image' ? 'min-h-0 flex-1' : placement === 'drawer' ? '' : 'py-6'">
          <slot />
        </div>
        <footer
          v-if="$slots.footer"
          class="[scrollbar-gutter:stable] max-h-24 flex shrink-0 items-center justify-between gap-3 overflow-auto border-t border-line pt-3.5"
        >
          <slot name="footer" />
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.acrylic-dialog:not(.acrylic-drawer)[open] {
  animation: dialog-enter 180ms ease-out;
}
.acrylic-dialog::backdrop {
  background: var(--color-scrim);
  backdrop-filter: blur(5px);
}
.acrylic-drawer::backdrop {
  background: transparent;
  backdrop-filter: none;
}
.drawer-panel {
  transform: translateX(100%);
  transition: transform 240ms cubic-bezier(.22, 1, .36, 1);
}
.drawer-scrim {
  opacity: 0;
  transition: opacity 240ms ease;
}
.acrylic-drawer[data-expanded='true'] .drawer-panel {
  transform: translateX(0);
}
.acrylic-drawer[data-expanded='true'] .drawer-scrim {
  opacity: 1;
}
@keyframes dialog-enter {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
