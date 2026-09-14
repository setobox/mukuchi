<script setup lang="ts">
const { actions } = useActionButtons()

async function runAction(action: (typeof actions.value)[number]): Promise<void> {
  await action.onClick()
}
</script>

<template>
  <TransitionGroup
    tag="div"
    class="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-actions flex flex-col gap-2.5"
    :role="actions.length ? 'toolbar' : undefined"
    :aria-label="actions.length ? '页面操作' : undefined"
    :aria-hidden="actions.length ? undefined : true"
    :inert="!actions.length"
    enter-active-class="transition-[opacity,transform]! duration-300! ease-out motion-reduce:duration-0!"
    enter-from-class="translate-x-3 translate-y-3 scale-90 opacity-0"
    leave-active-class="absolute bottom-0 right-0 transition-[opacity,transform]! duration-300! ease-out motion-reduce:duration-0!"
    leave-to-class="translate-x-3 translate-y-3 scale-90 opacity-0"
    move-class="transition-transform! duration-300! ease-out motion-reduce:duration-0!"
  >
    <button
      v-for="action in actions"
      :key="action.id"
      type="button"
      class="h-12 w-12 inline-flex items-center justify-center border border-line-strong rounded-lg bg-acrylic p-0 text-xl text-heading shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-md transition-[color,border-color,background-color,transform] duration-240 active:translate-0 hover:border-accent hover:bg-surface hover:text-accent-soft motion-reduce:transition-none hover:-translate-x-0.5 hover:-translate-y-0.5"
      :aria-label="action.label"
      :title="action.label"
      @click="runAction(action)"
    >
      <span :class="action.icon" aria-hidden="true" />
    </button>
  </TransitionGroup>
</template>
