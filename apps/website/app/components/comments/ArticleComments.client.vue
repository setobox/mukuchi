<script setup lang="ts">
const props = defineProps<{ path: string }>()
const config = useRuntimeConfig().public
const theme = useColorMode()
const container = useTemplateRef<HTMLElement>('container')
const loading = ref(true)
const failed = ref(false)
let timeout: ReturnType<typeof setTimeout> | undefined
const enabled = computed(() => !!config.giscusRepoId && !!config.giscusCategoryId)
function mount() {
  if (!container.value || !enabled.value)
    return
  container.value.replaceChildren()
  loading.value = true
  failed.value = false
  const script = document.createElement('script')
  script.src = 'https://giscus.app/client.js'
  script.async = true
  script.crossOrigin = 'anonymous'
  const attributes = { 'repo': config.giscusRepo, 'repo-id': config.giscusRepoId, 'category-id': config.giscusCategoryId, 'mapping': 'specific', 'term': props.path, 'strict': '1', 'reactions-enabled': '1', 'emit-metadata': '1', 'input-position': 'top', 'theme': theme.value === 'light' ? 'light' : 'dark', 'lang': 'zh-CN', 'loading': 'eager' }
  for (const [key, value] of Object.entries(attributes)) script.setAttribute(`data-${key}`, value)
  script.onerror = () => {
    failed.value = true
    loading.value = false
  }
  container.value.append(script)
  clearTimeout(timeout)
  timeout = setTimeout(() => {
    if (loading.value) {
      failed.value = true
      loading.value = false
    }
  }, 20000)
}
function receive(event: MessageEvent) {
  if (event.origin !== 'https://giscus.app' || event.source !== container.value?.querySelector('iframe')?.contentWindow)
    return
  if (event.data && typeof event.data === 'object' && 'giscus' in event.data) {
    loading.value = false
    const message: unknown = event.data.giscus
    // giscus reports this normal empty state before the first comment creates a discussion.
    failed.value = !!message && typeof message === 'object' && 'error' in message
      && !(typeof message.error === 'string' && message.error.includes('Discussion not found'))
    clearTimeout(timeout)
  }
}
onMounted(() => {
  mount()
  window.addEventListener('message', receive)
})
watch(() => props.path, mount)
watch(() => theme.value, (value) => {
  container.value?.querySelector('iframe')?.contentWindow?.postMessage({ giscus: { setConfig: { theme: value === 'light' ? 'light' : 'dark' } } }, 'https://giscus.app')
})
onBeforeUnmount(() => {
  clearTimeout(timeout)
  window.removeEventListener('message', receive)
})
</script>

<template>
  <section v-if="enabled" class="mt-10 border-t border-line pt-8" aria-label="文章评论">
    <h2 class="mb-3 text-title text-heading">
      评论
    </h2><p class="mb-5 text-xs text-muted">
      评论需要单独授权 giscus，网站登录与评论授权相互独立。
    </p><p v-if="loading" class="mb-4 text-xs text-muted" role="status">
      正在加载评论…
    </p><p v-if="failed" class="mb-4 text-xs text-muted">
      评论暂时无法加载。<button class="ml-2 min-h-11 text-accent-soft" @click="mount">
        重试
      </button>
    </p><div ref="container" />
  </section>
</template>
