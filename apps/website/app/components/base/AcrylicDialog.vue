<script setup lang="ts">
withDefaults(
  defineProps<{ title: string, description?: string, placement?: 'default' | 'toc' }>(),
  { placement: 'default' },
)
const emit = defineEmits<{ closed: [] }>()
const open = defineModel<boolean>({ default: false })
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = useId()
const descriptionId = useId()
const reducedMotion = usePreferredReducedMotion()
const body = shallowRef<HTMLElement | null>(null)
const locked = useScrollLock(body)
let returnFocus: HTMLElement | null = null
let exitAnimation: Animation | undefined

function keepFocusInside(event: KeyboardEvent) {
  const element = dialog.value
  if (event.key !== 'Tab' || !element)
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
  if (event.target !== dialog.value)
    return
  const rect = dialog.value?.getBoundingClientRect()
  if (
    rect
    && (event.clientX < rect.left
      || event.clientX > rect.right
      || event.clientY < rect.top
      || event.clientY > rect.bottom)
  ) {
    open.value = false
  }
}

onMounted(() => {
  body.value = document.body
  watch(
    open,
    async (value) => {
      const element = dialog.value
      if (!element)
        return
      exitAnimation?.cancel()
      if (value) {
        if (!element.open) {
          returnFocus
            = document.activeElement instanceof HTMLElement ? document.activeElement : null
          element.showModal()
          locked.value = true
        }
        return
      }
      if (!element.open)
        return
      if (reducedMotion.value !== 'reduce') {
        exitAnimation = element.animate(
          [
            { opacity: 1, transform: 'translateY(0)' },
            { opacity: 0, transform: 'translateY(-8px)' },
          ],
          { duration: 140, easing: 'ease-in' },
        )
        await exitAnimation.finished.catch(() => undefined)
      }
      if (!open.value) {
        element.close()
        locked.value = false
        if (returnFocus?.isConnected)
          returnFocus.focus({ preventScroll: true })
        emit('closed')
      }
    },
    { immediate: true },
  )
})

onBeforeUnmount(() => {
  exitAnimation?.cancel()
  dialog.value?.close()
  locked.value = false
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="acrylic-dialog mx-auto mb-auto overflow-auto border border-line-strong rounded-[20px] bg-acrylic p-6 text-ink shadow-dialog backdrop-blur-[24px]"
      :class="
        placement === 'toc'
          ? 'mt-[calc(var(--header-height)+44px)] w-[calc(100%-40px)] max-w-site max-h-[min(60dvh,28rem,calc(100dvh-var(--header-height)-60px))] md:w-[calc(100%-64px)]'
          : 'mt-[calc(var(--header-height)+14px)] w-[min(480px,calc(100vw-40px))] max-h-[calc(100dvh-100px)]'
      "
      tabindex="-1"
      :aria-labelledby="titleId"
      :aria-describedby="description ? descriptionId : undefined"
      @cancel.prevent="open = false"
      @keydown="keepFocusInside"
      @click="closeOnBackdrop"
      @close="open = false"
    >
      <header class="flex items-start justify-between gap-3">
        <div>
          <h2 :id="titleId" class="mt-1 text-[22px] text-heading">
            {{ title }}
          </h2>
          <p v-if="description" :id="descriptionId" class="mt-2 text-base text-muted">
            {{ description }}
          </p>
        </div>
        <button type="button" class="icon-button" aria-label="关闭弹窗" @click="open = false">
          <AppIcon name="close" />
        </button>
      </header>
      <div class="py-6">
        <slot />
      </div>
      <footer
        v-if="$slots.footer"
        class="flex items-center justify-between gap-3 border-t border-line pt-3.5"
      >
        <slot name="footer" />
      </footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.acrylic-dialog[open] {
  animation: dialog-enter 180ms ease-out;
}
.acrylic-dialog::backdrop {
  background: var(--color-scrim);
  backdrop-filter: blur(5px);
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
