<script setup lang="ts">
import { useScriptTag } from '@vueuse/core'

const props = defineProps<{ siteKey: string }>()
interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
  reset: (id: string) => void
  execute: (id: string) => void
}
const container = useTemplateRef<HTMLElement>('container')
const interactive = ref(false)
let widget: string | undefined
let pending: { resolve: (token: string) => void, reject: (error: Error) => void } | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
let revision = 0
const api = () => (window as Window & { turnstile?: TurnstileApi }).turnstile
const { load } = useScriptTag('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', undefined, { manual: true, async: true })
function settle(token?: string, message = '人机验证暂不可用，请重试。') {
  clearTimeout(timer)
  const current = pending
  pending = undefined
  interactive.value = false
  if (token)
    current?.resolve(token)
  else current?.reject(new Error(message))
}
async function verify(): Promise<string> {
  if (pending)
    throw new Error('正在验证，请稍候。')
  const version = ++revision
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject }
    timer = setTimeout(settle, 120_000, undefined, '人机验证超时，请重试。')
    void (async () => {
      try {
        await load()
        if (version !== revision)
          return
        if (disposed || !pending || !container.value || !api()) {
          settle()
          return
        }
        if (widget)
          api()?.remove(widget)
        {
          const finish = (token?: string, message?: string) => {
            if (version === revision)
              settle(token, message)
          }
          widget = api()!.render(container.value, {
            'sitekey': props.siteKey,
            'action': 'assistant',
            'theme': 'auto',
            'appearance': 'interaction-only',
            'execution': 'execute',
            'callback': (token: string) => finish(token),
            'expired-callback': () => finish(undefined, '验证已过期，请重新发送。'),
            'error-callback': () => finish(),
            'before-interactive-callback': () => {
              if (version === revision)
                interactive.value = true
            },
            'after-interactive-callback': () => {
              if (version === revision)
                interactive.value = false
            },
          })
        }
        api()?.execute(widget)
      }
      catch {
        if (version === revision)
          settle()
      }
    })()
  })
}
function cancel() {
  revision++
  settle(undefined, '验证已取消')
  if (widget) {
    api()?.remove(widget)
    widget = undefined
  }
}
defineExpose({ verify, cancel })
onBeforeUnmount(() => {
  disposed = true
  revision++
  settle(undefined, '验证已取消')
  if (widget)
    api()?.remove(widget)
})
</script>

<template>
  <div class="assistant-challenge" :class="{ 'needs-interaction': interactive }">
    <p v-if="interactive" class="mb-2 text-xs text-muted" role="status">
      请完成验证后继续发送。
    </p>
    <div ref="container" />
  </div>
</template>

<style scoped>
.assistant-challenge { width: 100%; }
.needs-interaction { margin-top: 12px; }
</style>
