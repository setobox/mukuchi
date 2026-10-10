<script setup lang="ts">
import type { AssistantBlock, AssistantMessage as Message } from '#shared/assistant/model'
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { cleanAssistantHtml } from '#shared/assistant/html'
import { assistantMessageSchema } from '#shared/assistant/model'
import AssistantLiveTest from '~/components/assistant/AssistantLiveTest.vue'
import AssistantMessage from '~/components/assistant/AssistantMessage.vue'
import AssistantStatus from '~/components/assistant/AssistantStatus.vue'
import BaseSelect from '~/components/base/BaseSelect.vue'
import { showcaseLabels, showcaseMessage } from '~/features/assistant/showcase'

definePageMeta({ layout: false })
useSeoMeta({ title: '助手结构展示', robots: 'noindex, nofollow' })
const selection = ref(-1)
const liveTest = ref(false)
const sampleOptions = [{ value: -1, label: '全部结构' }, ...showcaseLabels.map((label, value) => ({ value, label }))]
const widthOptions = [{ value: '375', label: '手机 · 375' }, { value: '480', label: '浮窗 · 480' }, { value: '820', label: '宽屏 · 820' }]
const themeOptions = [{ value: 'dark', label: '深色' }, { value: 'light', label: '浅色' }] as const
const source = ref(JSON.stringify(showcaseMessage(), null, 2))
const valid = shallowRef(showcaseMessage())
const edited = computed(() => {
  try {
    return assistantMessageSchema.safeParse(JSON.parse(source.value))
  }
  catch { return null }
})
const issue = computed(() => edited.value === null ? 'JSON 尚未完整，请检查语法。' : edited.value.success ? '' : edited.value.error.issues.map(item => `${item.path.join('.')}: ${item.message}`).slice(0, 3).join('\n'))
const htmlIssue = computed(() => {
  if (!edited.value?.success)
    return ''
  try {
    for (const block of edited.value.data.blocks) {
      if (block.type === 'html')
        cleanAssistantHtml(block.html, block.css)
    }
    return ''
  }
  catch (error) { return error instanceof Error ? error.message : 'HTML/CSS 无法展示' }
})
const theme = ref<'dark' | 'light'>('dark')
const width = ref('820')
const tab = ref<'json' | 'html' | 'css'>('json')
const state = ref('completed')
const preview = shallowRef<Message | null>(null)
const replaying = ref(false)
const replayLabel = ref('正在连接…')
const replayKey = ref(0)
const draft = ref('')
const notice = ref('')
const portal = useTemplateRef<HTMLElement>('portal')
const shown = computed(() => preview.value ?? valid.value)
const states = [
  ['completed', '已完成 · 用时 1分22秒'],
  ['connecting', '正在连接…'],
  ['checking', '正在检查输入…'],
  ['thinking', 'Thinking…'],
  ['searching', '正在搜索文章…'],
  ['found', '找到 3 篇文章'],
  ['reading', '正在读取《Cordis 与工作流设计》…'],
  ['generating', '正在生成回复…'],
  ['structure', '正在生成结构…'],
  ['retrying', '正在重试…（1/2）'],
  ['failed', '连接失败，请稍后重试'],
  ['interrupted', '本次回答已中断'],
  ['cancelled', '本次生成已停止'],
] as const
const stateOptions = states.map(([value, label]) => ({ value, label }))
const label = computed(() => replaying.value ? replayLabel.value : states.find(item => item[0] === state.value)?.[1])
const active = computed(() => replaying.value || !['completed', 'failed', 'interrupted', 'cancelled'].includes(state.value))
const editable = computed(() => edited.value?.success ? edited.value.data : valid.value)
const htmlIndex = computed(() => editable.value.blocks.findIndex(block => block.type === 'html'))
const htmlBlock = computed(() => {
  const block = editable.value.blocks[htmlIndex.value]
  return block?.type === 'html' ? block : undefined
})
const editor = computed({
  get: () => tab.value === 'json' ? source.value : htmlBlock.value?.[tab.value] ?? '',
  set: (value: string) => {
    if (tab.value === 'json') {
      source.value = value
      return
    }
    if (htmlIndex.value < 0)
      return
    const next = structuredClone(editable.value)
    const block = next.blocks[htmlIndex.value]
    if (block?.type === 'html') {
      block[tab.value] = value
      source.value = JSON.stringify(next, null, 2)
    }
  },
})
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
let releaseWait: (() => void) | undefined
function stop() {
  generation++
  clearTimeout(timer)
  releaseWait?.()
  releaseWait = undefined
  replaying.value = false
  preview.value = null
}
function wait(ms: number) {
  return new Promise<void>((resolve) => {
    releaseWait = resolve
    timer = setTimeout(() => {
      releaseWait = undefined
      resolve()
    }, ms)
  })
}
watch(edited, (value) => {
  stop()
  if (value?.success && !htmlIssue.value)
    valid.value = value.data
})
watch(selection, () => {
  stop()
  source.value = JSON.stringify(showcaseMessage(selection.value), null, 2)
  tab.value = 'json'
})
function reset() {
  source.value = JSON.stringify(showcaseMessage(selection.value), null, 2)
  notice.value = ''
  draft.value = ''
}
async function replay() {
  stop()
  const current = generation
  const message = structuredClone(valid.value)
  replayKey.value++
  replaying.value = true
  const rendered: AssistantBlock[] = []
  preview.value = { ...message, blocks: [], suggestions: [] }
  for (const status of ['正在连接…', 'Thinking…', '正在搜索文章…', '找到 3 篇文章']) {
    replayLabel.value = status
    await wait(450)
    if (current !== generation)
      return
  }
  for (const block of message.blocks) {
    if (block.type === 'text') {
      replayLabel.value = '正在生成回复…'
      const characters = Array.from(block.text)
      for (let end = 6; end < characters.length + 6; end += 6) {
        preview.value = { ...message, blocks: [...rendered, { ...block, text: characters.slice(0, end).join('') }], suggestions: [] }
        await wait(30)
        if (current !== generation)
          return
      }
    }
    else {
      replayLabel.value = '正在生成结构…'
      await wait(420)
      if (current !== generation)
        return
    }
    rendered.push(block)
    preview.value = { ...message, blocks: [...rendered], suggestions: [] }
  }
  replaying.value = false
  state.value = 'completed'
  preview.value = message
}
onBeforeUnmount(stop)
</script>

<template>
  <main class="showcase-page">
    <header class="showcase-header">
      <div>
        <p class="mb-2 text-xs text-accent-soft tracking-widest">
          ASSISTANT / RENDER LAB
        </p><h1>助手结构展示</h1><p class="mt-2 text-sm text-muted">
          查看结构、调整细节，让回答更容易理解。所有编辑仅在当前页面生效。
        </p>
      </div>
      <NuxtLink to="/posts" class="text-link text-sm">
        <span class="i-lucide-arrow-left" aria-hidden="true" />返回博客
      </NuxtLink>
    </header>
    <div class="showcase-toolbar">
      <div class="flex gap-3">
        <button type="button" :aria-pressed="!liveTest" class="text-link text-sm" @click="liveTest = false">
          本地样例
        </button>
        <button type="button" :aria-pressed="liveTest" class="text-link text-sm" @click="liveTest = true; stop()">
          管理员真实测试
        </button>
      </div>
      <BaseSelect v-if="!liveTest" v-model="selection" class="showcase-select" label="样例" :options="sampleOptions" />
      <BaseSelect v-model="width" class="showcase-select" label="预览宽度" :options="widthOptions" />
      <BaseSelect v-model="theme" class="showcase-select" label="主题" :options="themeOptions" />
      <button v-if="!liveTest" type="button" class="button-primary" :disabled="!!issue" @click="replaying ? stop() : replay()">
        <span :class="replaying ? 'i-lucide-square' : 'i-lucide-play'" aria-hidden="true" />{{ replaying ? '停止演示' : '重播流式与动画' }}
      </button>
    </div>
    <div v-if="liveTest" class="showcase-preview" :class="`preview-${theme}`" :style="{ maxWidth: `${width}px` }">
      <AssistantLiveTest :theme="theme" />
    </div>
    <div v-else class="showcase-workspace">
      <aside class="showcase-editor">
        <div class="showcase-editor-header">
          <div class="flex gap-1">
            <button v-for="kind in (['json', 'html', 'css'] as const)" :key="kind" type="button" :aria-pressed="tab === kind" :disabled="kind !== 'json' && !htmlBlock" @click="tab = kind">
              {{ kind.toUpperCase() }}
            </button>
          </div><button type="button" class="text-xs text-muted" @click="reset">
            重置
          </button>
        </div>
        <textarea v-model="editor" class="showcase-code" :aria-label="`${tab.toUpperCase()} 样例编辑器`" spellcheck="false" />
        <p class="showcase-validation" :class="issue || htmlIssue ? 'text-warn' : 'text-success'" role="status">
          {{ issue || htmlIssue || '✓ 结构有效 · 实时预览' }}
        </p>
        <p class="px-4 pb-4 text-xs text-muted">
          不调用模型，不保存到服务器。无效输入会保留上一次有效预览。
        </p>
      </aside>
      <section class="showcase-preview-area" aria-label="渲染预览">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs text-muted">LIVE PREVIEW · 共用聊天渲染器</span>
          <BaseSelect v-model="state" class="max-w-full w-64" aria-label="预览状态" :options="stateOptions" :disabled="replaying" />
        </div>
        <div ref="portal" class="showcase-preview" :class="`preview-${theme}`" :style="{ maxWidth: `${width}px` }">
          <p class="showcase-question">
            能用直观的结构解释一下吗？
          </p>
          <AssistantStatus class="mb-5" :active="active" :label="label" :duration-ms="82_000" :failed="state === 'failed' || state === 'interrupted'" />
          <AssistantMessage :key="replayKey" :message="shown" :busy="active" :animate="replaying" :theme="theme" :portal-target="portal ?? undefined" @suggestion="draft = $event; notice = '建议已填入下方输入框。'" @navigate="notice = '导航按钮演示：正式对话中会确认并打开对应文章。'" />
          <p v-if="replaying && !shown.blocks.length" class="py-6 text-sm text-muted">
            回复即将显示…
          </p>
          <div class="showcase-composer">
            <textarea v-model="draft" rows="2" placeholder="点击追问建议，观察填入效果…" aria-label="建议输入预览" /><span>本地样例 · 不发送消息</span>
          </div>
          <p v-if="notice" class="mt-3 text-xs text-muted" role="status">
            {{ notice }}
          </p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.showcase-page { max-width: 1500px; margin: 0 auto; padding: 44px 32px 80px; }
.showcase-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 30px; }
.showcase-header h1 { color: var(--color-heading); font-size: 30px; font-weight: 650; letter-spacing: -.03em; }
.showcase-toolbar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; padding: 18px 0; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); margin-bottom: 26px; }
.showcase-select { width: 160px; max-width: 100%; }
.showcase-toolbar > button { margin-left: auto; }
.showcase-workspace { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 28px; align-items: start; }
.showcase-editor { position: sticky; top: 24px; border: 1px solid var(--color-border-strong); border-radius: 14px; overflow: hidden; background: var(--color-surface); }
.showcase-editor-header { display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 1px solid var(--color-border); }
.showcase-editor-header button { border-radius: 6px; padding: 6px 9px; font-size: 11px; }
.showcase-editor-header button[aria-pressed="true"] { color: var(--color-accent-text); background: var(--color-accent-surface); }
.showcase-editor-header button:disabled { opacity: .35; }
.showcase-code { display: block; width: 100%; height: min(60vh, 600px); min-height: 300px; resize: vertical; background: transparent; padding: 16px; font: 12px/1.75 var(--font-mono); tab-size: 2; white-space: pre; overflow: auto; }
.showcase-validation { padding: 12px 16px; font-size: 11px; white-space: pre-wrap; border-top: 1px solid var(--color-border); }
.showcase-preview { position: relative; margin: 0 auto; width: 100%; padding: 28px; border: 1px solid var(--color-border-strong); border-radius: 18px; color: var(--color-heading); background: var(--color-canvas); transition: max-width .24s ease, background .2s; }
.preview-dark { color-scheme: dark; --color-canvas: #252423; --color-surface: #302e2d; --color-text: #b4b1af; --color-heading: #eeebe8; --color-muted: #9b9591; --color-border: #ffffff12; --color-border-strong: #ffffff24; --color-success: #88d9b1; --color-warn: #f1cb7a; --color-accent-text: #b689ff; }
.preview-light { color-scheme: light; --color-canvas: #faf8f5; --color-surface: #f0ece7; --color-text: #45413e; --color-heading: #252423; --color-muted: #716963; --color-border: #302e2d24; --color-border-strong: #302e2d48; --color-success: #47715c; --color-warn: #79663d; --color-accent-text: #774dba; }
.showcase-question { width: fit-content; margin-left: auto; padding: 10px 16px; border-radius: 15px; background: var(--color-accent-surface); margin-bottom: 32px; font-size: 13px; }
.showcase-composer { margin-top: 32px; padding: 12px; border: 1px solid var(--color-border-strong); border-radius: 12px; }
.showcase-composer textarea { display: block; width: 100%; background: transparent; resize: vertical; font-size: 13px; outline: none; }
.showcase-composer span { font-size: 10px; color: var(--color-muted); }
@media (max-width: 1000px) { .showcase-workspace { grid-template-columns: 1fr; }.showcase-editor { position: static; }.showcase-code { height: 260px; min-height: 160px; } }
@media (max-width: 600px) { .showcase-page { padding: 24px 16px; }.showcase-header { align-items: flex-start; }.showcase-header h1 { font-size: 24px; }.showcase-preview { padding: 18px; }.showcase-toolbar { gap: 10px; }.showcase-toolbar > button { margin-left: 0; } }
@media (prefers-reduced-motion: reduce) { .showcase-preview { transition: none; } }
</style>
