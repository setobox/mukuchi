<script setup lang="ts">
import { useScriptTag } from '@vueuse/core'

const props = defineProps<{ siteKey: string, reset: number }>()
const emit = defineEmits<{ token: [value: string] }>()
interface TurnstileApi {
  render: (element: HTMLElement, options: { 'sitekey': string, 'action': string, 'theme': string, 'callback': (token: string) => void, 'expired-callback': () => void, 'error-callback': () => void }) => string
  remove: (id: string) => void
  reset: (id: string) => void
}
const container = useTemplateRef('container')
const error = ref(false)
let widget: string | undefined
function api(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile
}
function render() {
  if (!container.value || !api() || widget)
    return
  widget = api()!.render(container.value, {
    'sitekey': props.siteKey,
    'action': 'assistant',
    'theme': 'auto',
    'callback': (token) => {
      error.value = false
      emit('token', token)
    },
    'expired-callback': () => emit('token', ''),
    'error-callback': () => {
      error.value = true
      emit('token', '')
    },
  })
}
const { load } = useScriptTag('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', render, { manual: true, async: true })
onMounted(async () => {
  try {
    await load()
    render()
  }
  catch { error.value = true }
})
watch(() => props.reset, () => {
  emit('token', '')
  if (widget)
    api()?.reset(widget)
})
onBeforeUnmount(() => {
  if (widget)
    api()?.remove(widget)
})
</script>

<template>
  <div>
    <div ref="container" class="overflow-hidden" />
    <p v-if="error" class="text-xs text-error" role="status">
      人机验证暂不可用，请刷新后重试。
    </p>
  </div>
</template>
