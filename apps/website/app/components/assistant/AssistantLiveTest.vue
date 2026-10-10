<script setup lang="ts">
import type { LocalTurn } from '~/features/assistant/local-model'
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { z } from 'zod'
import { articlePathSchema, assistantSessionSchema } from '#shared/assistant/model'
import { createAssistantController } from '~/features/assistant/controller'
import { createLocalHistory } from '~/features/assistant/history'
import { memoryHistoryDatabase } from '~/features/assistant/storage'
import { readTurnResponse } from '~/features/assistant/transport'
import AssistantMessage from './AssistantMessage.vue'
import AssistantStatus from './AssistantStatus.vue'

defineProps<{ theme: 'light' | 'dark' }>()
const auth = useAuthSession()
const base = `${useRuntimeConfig().app.baseURL.replace(/\/$/, '')}/api/admin/assistant/preview`
const model = ref('')
const setupError = ref('')
const loading = ref(false)
const article = ref('')
const administrator = computed(() => auth.current.value.user?.role === 'admin')
const viewport = useTemplateRef<HTMLElement>('viewport')
const content = useTemplateRef<HTMLElement>('content')
const portal = useTemplateRef<HTMLElement>('portal')
const input = useTemplateRef<HTMLTextAreaElement>('input')
const following = ref(true)
const unread = ref(false)
const assistant = createAssistantController({
  history: Promise.resolve(createLocalHistory(memoryHistoryDatabase(), () => {})),
  automaticNavigation: false,
  navigate: async () => {},
  transport: {
    session: async () => {
      setupError.value = ''
      const response = await fetch(`${base}/session`, { credentials: 'same-origin', cache: 'no-store' })
      const value: unknown = await response.json()
      const parsed = z.object({ model: z.string(), session: assistantSessionSchema }).safeParse(value)
      if (!response.ok || !parsed.success) {
        setupError.value = z.object({ message: z.string() }).safeParse(value).data?.message ?? '无法读取已保存的模型配置'
        throw new Error(setupError.value)
      }
      model.value = parsed.data.model
      return parsed.data.session
    },
    post: async (path, body, csrf, signal) => {
      const response = await fetch(`${base}${path}`, { method: 'POST', credentials: 'same-origin', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, signal })
      return response.json() as Promise<unknown>
    },
    stream: async (path, body, csrf, requestId, receive, signal) => {
      const response = await fetch(`${base}${path}`, { method: 'POST', credentials: 'same-origin', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'accept': 'text/event-stream', 'x-csrf-token': csrf, 'x-assistant-request-id': requestId }, signal })
      return readTurnResponse(response, requestId, receive, signal)
    },
  },
})
const { turns, previews, draft, busy, enabled, error } = assistant
const messageFor = (turn: LocalTurn) => turn.record?.assistant ?? previews.value[turn.id]?.message ?? turn.preview
async function refresh() {
  loading.value = true
  try {
    await auth.refresh()
    if (administrator.value) {
      await assistant.refreshSession()
      assistant.mode.value = 'fullscreen'
    }
  }
  finally { loading.value = false }
}
async function login() {
  try {
    await auth.localLogin()
    await refresh()
  }
  catch { /* Auth composable exposes the message below. */ }
}
function toBottom() {
  following.value = true
  unread.value = false
  if (viewport.value)
    viewport.value.scrollTop = viewport.value.scrollHeight
}
function onScroll() {
  const element = viewport.value
  if (element) {
    following.value = element.scrollHeight - element.scrollTop - element.clientHeight < 60
    if (following.value)
      unread.value = false
  }
}
useResizeObserver(content, () => {
  if (following.value)
    toBottom()
  else unread.value = true
})
async function send() {
  const path = article.value.trim()
  if (path && !articlePathSchema.safeParse(path).success) {
    error.value = '请输入 /posts/ 开头的站内文章路径'
    return
  }
  assistant.page.value = { path: path || null }
  following.value = true
  await assistant.send()
}
async function suggestion(text: string) {
  draft.value = text
  await nextTick()
  input.value?.focus()
}
watch(administrator, async (value) => {
  if (!value) {
    await assistant.stop()
    await assistant.clear()
    assistant.session.value = null
    model.value = ''
  }
})
onMounted(refresh)
onBeforeUnmount(assistant.dispose)
</script>

<template>
  <section ref="portal" class="live-test" aria-label="管理员真实测试">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="font-semibold">
        真实模型测试
      </h2>
      <button type="button" class="text-link text-xs" :disabled="busy || loading" @click="refresh">
        刷新配置与身份
      </button>
    </div>
    <p class="mt-2 text-xs text-muted leading-relaxed">
      仅管理员可用。调用后台保存的模型，不调用内容审核、不占用日常配额；模型服务商仍可能计费。对话只保留在本页，后台记录执行状态。导航仅展示，不自动跳转。
    </p>
    <div v-if="!administrator" class="my-6 flex flex-wrap items-center gap-4 text-sm">
      <span>请先登录管理员账号。</span>
      <button v-if="auth.current.value.localAvailable" type="button" class="button-primary" :disabled="auth.busy.value" @click="login">
        本地管理员登录
      </button>
      <NuxtLink v-else to="/admin" class="text-link">
        前往后台登录
      </NuxtLink>
    </div>
    <template v-else>
      <p class="my-4 text-xs text-muted">
        当前模型：{{ model || '尚未就绪' }} · <NuxtLink to="/admin/ai?tab=assistant" class="text-link">
          模型设置
        </NuxtLink>
      </p>
      <div ref="viewport" class="live-viewport" tabindex="0" aria-label="真实对话内容" @scroll="onScroll">
        <div ref="content" class="space-y-8">
          <p v-if="!turns.length" class="py-10 text-center text-sm text-muted">
            输入问题，观察真实状态、工具调用和流式回答。
          </p>
          <article v-for="turn in turns" :key="turn.id">
            <p class="live-question">
              {{ turn.user }}
            </p>
            <AssistantStatus class="mb-3" :active="turn.status === 'pending'" :duration-ms="turn.record?.durationMs ?? turn.durationMs" :failed="['failed', 'interrupted'].includes(turn.status)" :label="turn.status === 'pending' ? previews[turn.id]?.label : turn.status === 'completed' ? undefined : turn.error || '本次生成已停止'" />
            <AssistantMessage v-if="messageFor(turn)?.blocks.length" :message="messageFor(turn)!" :busy="turn.status === 'pending'" :animate="turn.status === 'pending'" :theme="theme" :portal-target="portal ?? undefined" :action-busy="true" @suggestion="suggestion" />
          </article>
        </div>
      </div>
      <button v-if="unread" type="button" class="text-link mt-2 text-xs" @click="toBottom">
        有新回复 ↓
      </button>
      <form class="mt-5 space-y-3" @submit.prevent="send">
        <label class="block text-xs text-muted">文章上下文（可选）<input v-model="article" class="live-input mt-2" placeholder="/posts/文章路径" :disabled="busy"></label>
        <textarea ref="input" v-model="draft" class="live-input" rows="3" maxlength="500" aria-label="真实测试问题" placeholder="例如：搜索 Vue 相关文章，阅读一篇后，用结构图解释核心概念。" :disabled="!enabled || busy" />
        <div class="flex flex-wrap items-center gap-3">
          <button v-if="busy" type="button" class="button-primary" @click="assistant.stop">
            停止生成
          </button>
          <button v-else type="submit" class="button-primary" :disabled="!enabled || !draft.trim() || loading">
            发送测试
          </button>
          <button type="button" class="text-xs text-muted" :disabled="busy" @click="assistant.clear">
            清空测试对话
          </button>
          <span class="ml-auto text-xs text-muted">{{ draft.length }}/500</span>
        </div>
      </form>
    </template>
    <p v-if="setupError || error || auth.error.value" class="mt-4 text-sm text-warn" role="alert">
      {{ setupError || error || auth.error.value }}
    </p>
  </section>
</template>

<style scoped>
.live-test { min-width: 0; }
.live-viewport { max-height: 65vh; min-height: 180px; overflow: auto; scrollbar-gutter: stable; overflow-anchor: none; padding: 8px; }
.live-question { width: fit-content; max-width: 90%; margin: 0 0 24px auto; padding: 10px 16px; border-radius: 15px; background: var(--color-accent-surface); font-size: 13px; white-space: pre-wrap; }
.live-input { display: block; width: 100%; padding: 10px 12px; background: var(--color-surface); border: 1px solid var(--color-border-strong); border-radius: 10px; font-size: 13px; color: var(--color-heading); resize: vertical; }
.live-input:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
</style>
