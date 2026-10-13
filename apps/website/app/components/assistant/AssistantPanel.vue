<script setup lang="ts">
import type { LocalTurn } from '~/features/assistant/local-model'
import { useEventListener, useResizeObserver, useScrollLock } from '@vueuse/core'
import { pasteSingleLine } from '~/features/assistant/input'
import { useAssistantMotion } from '~/features/assistant/motion'
import AssistantChallenge from './AssistantChallenge.vue'
import AssistantMessage from './AssistantMessage.vue'
import AssistantStatus from './AssistantStatus.vue'

const assistant = useAssistant()!
const { mode, drawer, currentId, turns, draft, page, pageTitle, active, previews, error, storageWarning, limited, groups, busy, busyElsewhere, enabled, undoSnapshot, navigationResults, actionBusy, session } = assistant
const motion = useAssistantMotion()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const input = useTemplateRef<HTMLInputElement>('input')
const list = useTemplateRef<HTMLElement>('list')
const conversationBody = useTemplateRef<HTMLElement>('conversationBody')
const drawerElement = useTemplateRef<HTMLElement>('drawerElement')
const historyButton = useTemplateRef<HTMLButtonElement>('historyButton')
const locked = useScrollLock(document.body)
const challenge = useTemplateRef<InstanceType<typeof AssistantChallenge>>('challenge')
const verifying = ref(false)
const auth = useAuthSession()
const route = useRoute()
const greeting = ref('')
function refreshGreeting() {
  const hour = new Date().getHours()
  greeting.value = hour >= 6 && hour < 11 ? '早上好' : hour >= 11 && hour < 18 ? '中午好' : '晚上好'
}
const questions = computed(() => [
  ...(page.value.path ? ['这篇文章讲了什么？', '相关文章有哪些？'] : /^\/(?:posts|categories|tags|archive|series)(?:\/|$)/.test(assistant.routePath.value) ? ['有哪些热门文章推荐？'] : []),
  '如何订阅博客更新？',
])
let sendRevision = 0
const confirmClear = ref(false)
const nearBottom = ref(true)
const newReply = ref(false)
const viewport = ref({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 })
let previousFocus: HTMLElement | null = null
let disposed = false
let backdropPressed = false
useActionButton({ id: 'assistant', icon: 'i-lucide-sparkles', label: '有问题？来试试这个！', unread: assistant.unread, order: 15, visible: computed(() => enabled.value && mode.value === 'hidden'), onClick: () => assistant.open(undefined, false, 'floating') })
function updateViewport() {
  viewport.value = { height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 }
}
useEventListener(window, 'resize', updateViewport)
useEventListener(window.visualViewport, 'resize', updateViewport)
useEventListener(window.visualViewport, 'scroll', updateViewport)
watch(mode, async (value, previous) => {
  refreshGreeting()
  motion.reset()
  sendRevision++
  verifying.value = false
  challenge.value?.cancel()
  backdropPressed = false
  if (previous === 'hidden' && value !== 'hidden')
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  if (disposed || !dialog.value || value !== mode.value)
    return
  locked.value = value === 'fullscreen'
  if (dialog.value.open)
    dialog.value.close()
  if (value === 'fullscreen') {
    dialog.value.showModal()
  }
  else if (value === 'floating') {
    dialog.value.show()
  }
  else {
    previousFocus?.focus({ preventScroll: true })
    return
  }
  input.value?.focus({ preventScroll: true })
  if (!assistant.loadingConversation.value)
    void motion.scene(dialog.value, !turns.value.length)
})
watch(drawer, async (value) => {
  confirmClear.value = false
  await nextTick()
  if (value)
    drawerElement.value?.querySelector<HTMLButtonElement>('button')?.focus()
  else historyButton.value?.focus({ preventScroll: true })
  if (value)
    void assistant.syncHistory(true)
})
function scrollBottom() {
  const element = mode.value === 'fullscreen' ? dialog.value : list.value
  if (element)
    element.scrollTop = element.scrollHeight
  nearBottom.value = true
  newReply.value = false
}
function onScroll() {
  const element = mode.value === 'fullscreen' ? dialog.value : list.value
  nearBottom.value = !!element && element.scrollHeight - element.scrollTop - element.clientHeight < 48
  if (nearBottom.value)
    newReply.value = false
}
watch([() => turns.value.length, () => turns.value.at(-1)?.status, previews], async () => {
  await nextTick()
  if (nearBottom.value)
    scrollBottom()
  else newReply.value = true
})
watch(currentId, async () => {
  refreshGreeting()
  sendRevision++
  verifying.value = false
  challenge.value?.cancel()
  motion.reset()
  await nextTick()
  scrollBottom()
  if (mode.value !== 'hidden' && !assistant.loadingConversation.value)
    input.value?.focus({ preventScroll: true })
  if (dialog.value && mode.value !== 'hidden' && !assistant.loadingConversation.value)
    void motion.scene(dialog.value, !turns.value.length)
})
watch(assistant.loadingConversation, async (loading) => {
  if (loading) {
    motion.reset()
  }
  else {
    await nextTick()
    scrollBottom()
    if (dialog.value && mode.value !== 'hidden')
      void motion.scene(dialog.value, !turns.value.length)
    input.value?.focus({ preventScroll: true })
  }
})
useResizeObserver(conversationBody, () => {
  if (nearBottom.value)
    scrollBottom()
})
function messageFor(turn: LocalTurn) {
  return turn.record?.assistant ?? previews.value[turn.id]?.message ?? turn.preview
}
function suggestion(text: string) {
  if (verifying.value)
    return
  draft.value = text
  input.value?.focus({ preventScroll: true })
}
watch([assistant.queuedSend, busy, mode], () => {
  if (assistant.queuedSend.value && !busy.value && mode.value !== 'hidden')
    void send()
}, { flush: 'post' })
useEventListener(window, 'keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'i' && !event.isComposing) {
    if (!enabled.value)
      return
    event.preventDefault()
    void assistant.open(undefined, false, 'fullscreen').then(() => input.value?.focus({ preventScroll: true }))
  }
})
async function signIn() {
  if (!auth.current.value.ssoAvailable) {
    auth.loginOpen.value = true
    return
  }
  await navigateTo(auth.loginUrl(route.fullPath, 'github'), { external: true })
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (drawer.value)
      drawer.value = false
    else assistant.close()
  }
  if (drawer.value && event.key === 'Tab') {
    const buttons = [...(drawerElement.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const first = buttons[0]
    const last = buttons.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    }
    else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
}
function isBackdrop(event: MouseEvent) {
  return mode.value === 'fullscreen' && event.target instanceof HTMLElement && event.target.hasAttribute('data-assistant-backdrop')
}
function pressBackdrop(event: PointerEvent) {
  backdropPressed = event.button === 0 && isBackdrop(event)
}
function closeOnBackdrop(event: MouseEvent) {
  const close = backdropPressed && isBackdrop(event)
  backdropPressed = false
  if (!close)
    return
  if (drawer.value)
    drawer.value = false
  else assistant.close()
}
async function send() {
  if (!draft.value.trim() || busy.value || verifying.value)
    return
  if (draft.value.trim().length > (session.value?.inputLimit ?? 500)) {
    await assistant.send()
    await nextTick()
    scrollBottom()
    return
  }
  const version = ++sendRevision
  const id = currentId.value
  const text = draft.value
  const namespace = session.value?.namespace
  assistant.queuedSend.value = false
  try {
    verifying.value = !session.value?.authenticated
    const token = verifying.value ? await challenge.value?.verify() : undefined
    if (version !== sendRevision || id !== currentId.value || draft.value !== text || namespace !== session.value?.namespace || mode.value === 'hidden')
      return
    if (!session.value?.authenticated && !token)
      throw new Error('验证暂不可用，请重试。')
    await assistant.send(token)
  }
  catch (cause) {
    if (version === sendRevision && id === currentId.value)
      error.value = cause instanceof Error ? cause.message : '发送失败，请重试'
  }
  finally {
    if (version === sendRevision)
      verifying.value = false
  }
}
function paste(event: ClipboardEvent) {
  if (verifying.value) {
    event.preventDefault()
    return
  }
  if (input.value)
    pasteSingleLine(event, input.value, value => draft.value = value)
}
function inputKey(event: KeyboardEvent) {
  if (event.key !== 'Enter')
    return
  event.preventDefault()
  if (!event.shiftKey && !event.isComposing && event.keyCode !== 229)
    void send()
}
function dateLabel(value: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value)
}
onBeforeUnmount(() => {
  disposed = true
  locked.value = false
  dialog.value?.close()
})
</script>

<template>
  <dialog ref="dialog" class="assistant-panel" :class="{ 'is-floating': mode === 'floating' }" :style="{ '--assistant-height': `${viewport.height}px`, '--assistant-top': `${viewport.top}px` }" aria-label="博客 AI 助手" data-assistant-backdrop @scroll="onScroll" @pointerdown="pressBackdrop" @pointercancel="backdropPressed = false" @click="closeOnBackdrop" @keydown="keydown" @cancel.prevent="drawer ? drawer = false : assistant.close()">
    <div class="assistant-scene-background assistant-scene-ui" aria-hidden="true" /><div class="assistant-shell" data-assistant-backdrop>
      <header class="assistant-header assistant-scene-ui" data-assistant-backdrop>
        <button ref="historyButton" class="assistant-icon control-base control-quiet" type="button" title="会话列表" aria-label="会话列表" :aria-expanded="drawer" aria-controls="assistant-history" @click="drawer = !drawer">
          <span class="i-lucide-panel-left" aria-hidden="true" />
        </button>
        <div class="ml-auto flex gap-1">
          <button class="assistant-icon control-base control-quiet" type="button" :title="mode === 'fullscreen' ? '缩小' : '全屏'" :aria-label="mode === 'fullscreen' ? '缩小' : '全屏'" @click="mode = mode === 'fullscreen' ? 'floating' : 'fullscreen'">
            <span :class="mode === 'fullscreen' ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" aria-hidden="true" />
          </button>
          <button class="assistant-icon control-base control-quiet" type="button" title="新会话" aria-label="新会话" @click="assistant.newConversation()">
            <span class="i-lucide-message-circle-plus" aria-hidden="true" />
          </button>
          <button class="assistant-icon control-base control-quiet" type="button" title="关闭助手" aria-label="关闭助手" @click="assistant.close()">
            <span class="i-lucide-x" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div class="assistant-workspace" data-assistant-backdrop>
        <main class="assistant-main" :class="{ 'is-empty': !turns.length && !assistant.feedback.value }" :inert="drawer || undefined" data-assistant-backdrop>
          <div ref="list" class="assistant-conversation" aria-label="聊天记录" tabindex="0" data-assistant-backdrop @scroll="onScroll">
            <div ref="conversationBody" data-assistant-backdrop>
              <div v-if="!turns.length && !assistant.feedback.value" class="assistant-welcome">
                <span class="i-lucide-sparkles text-3xl text-accent-soft" aria-hidden="true" />
                <h3 class="assistant-greeting">
                  {{ greeting }}
                </h3>
              </div>
              <article v-for="turn in turns" :key="turn.id" class="assistant-turn" data-assistant-backdrop>
                <p class="assistant-user">
                  {{ turn.user }}
                </p>
                <div v-if="mode !== 'hidden'" class="assistant-reply">
                  <AssistantStatus class="mb-3" :active="turn.status === 'pending'" :duration-ms="turn.record?.durationMs ?? turn.durationMs" :failed="['failed', 'interrupted'].includes(turn.status)" :label="turn.status === 'pending' ? previews[turn.id]?.label : turn.status === 'completed' ? undefined : turn.error || '本次生成已停止'" />
                  <AssistantMessage v-if="messageFor(turn)?.blocks.length" :message="messageFor(turn)!" :busy="turn.status === 'pending'" :animate="turn.status === 'pending'" :portal-target="dialog ?? undefined" :navigation-results="navigationResults" :action-busy="actionBusy" @suggestion="suggestion" @navigate="assistant.navigateAction($event, turn.conversationId, true)" />
                  <div v-if="turn.status === 'pending' && (!messageFor(turn)?.blocks.length || previews[turn.id]?.label === '正在生成结构…')" class="assistant-reply-placeholder" aria-hidden="true">
                    <span /><span />
                  </div>
                </div>
              </article>
              <p v-if="assistant.feedback.value" class="assistant-reply assistant-validation" role="status">
                {{ assistant.feedback.value }}
              </p>
            </div>
          </div>
          <button v-if="newReply" class="assistant-new-reply" type="button" @click="scrollBottom">
            有新回复 ↓
          </button>
          <div class="assistant-dock">
            <div v-if="!turns.length && !assistant.feedback.value" class="assistant-questions">
              <button v-for="question in questions" :key="question" class="assistant-suggestion" type="button" @click="suggestion(question)">
                {{ question }}
              </button>
            </div>
            <p v-if="page.path" class="assistant-context assistant-scene-ui">
              Agent 正在使用文章 <strong>{{ pageTitle || page.path }}</strong>
            </p>
            <div v-if="!session?.authenticated" class="assistant-login assistant-scene-ui">
              <span>在所有设备上保存你的会话和历史</span>
              <button type="button" class="assistant-signin control-quiet" @click="signIn">
                <span class="i-lucide-github" aria-hidden="true" />Sign in
              </button>
            </div>
            <div class="assistant-composer assistant-scene-ui">
              <p v-if="assistant.syncWarning.value" class="mb-2 text-xs text-warn" role="status">
                {{ assistant.syncWarning.value }}
              </p>
              <p v-if="storageWarning" class="mb-2 text-xs text-warn" role="status">
                {{ storageWarning }}
              </p>
              <p v-if="limited" class="mb-2 text-xs text-muted">
                本次仅使用最近的部分上下文或文章片段。
              </p>
              <p v-if="error" class="mb-2 text-xs text-error" role="alert">
                {{ error }}
              </p>
              <p v-if="busyElsewhere || (active && active.conversationId !== currentId)" class="mb-2 text-xs text-muted">
                另一个会话正在生成，可以继续浏览，完成后再发送。
              </p>
              <form @submit.prevent="send">
                <input ref="input" v-model="draft" class="assistant-input" type="text" placeholder="问点什么？" aria-label="向助手提问" autocomplete="off" :readonly="verifying" @keydown="inputKey" @paste="paste">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs text-muted">{{ session?.remaining ?? 0 }} / {{ session?.dailyLimit ?? 0 }}</span>
                  <button v-if="active" class="assistant-icon control-base control-quiet" type="button" title="停止生成" aria-label="停止生成" @click="assistant.stop()">
                    <span class="i-lucide-square" aria-hidden="true" />
                  </button>
                  <button v-else class="assistant-icon control-base control-quiet bg-accent-surface" type="submit" :disabled="busy || verifying || !draft.trim()" title="发送消息" aria-label="发送消息">
                    <span :class="verifying ? 'i-lucide-loader-circle animate-spin' : 'i-lucide-arrow-up'" aria-hidden="true" />
                  </button>
                </div>
              </form>
              <AssistantChallenge v-if="session?.enabled && !session.authenticated && mode !== 'hidden'" ref="challenge" :site-key="session.turnstileSiteKey" />
              <p class="mt-2 text-center text-[11px] text-muted">
                回答可能有误，请结合引用核实。
              </p>
            </div>
          </div>
        </main>
        <Transition name="assistant-drawer">
          <aside v-if="drawer" id="assistant-history" ref="drawerElement" class="assistant-history" aria-label="会话列表">
            <div class="mb-4 flex items-center justify-between">
              <strong>会话记录</strong><button class="assistant-icon control-base control-quiet" type="button" aria-label="关闭会话列表" @click="drawer = false">
                <span class="i-lucide-x" aria-hidden="true" />
              </button>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto">
              <p v-if="!groups.length" class="text-sm text-muted">
                还没有会话
              </p>
              <section v-for="group in groups" :key="group.label" class="mb-5">
                <h3 class="mb-2 text-xs text-muted">
                  {{ group.label }}
                </h3>
                <div v-for="item in group.items" :key="item.id" class="assistant-history-row" :class="{ selected: item.id === currentId }">
                  <button type="button" class="min-w-0 flex-1 text-left" :aria-current="item.id === currentId ? 'true' : undefined" @click="assistant.select(item.id)">
                    <span class="block truncate text-sm">{{ item.unread ? '● ' : '' }}{{ item.title }}</span><time class="block text-[11px] text-muted" :datetime="new Date(item.updatedAt).toISOString()">{{ dateLabel(item.updatedAt) }}</time>
                  </button>
                  <button class="assistant-icon control-base control-quiet" type="button" :aria-label="`删除会话：${item.title}`" @click="assistant.remove(item.id)">
                    <span class="i-lucide-trash-2" aria-hidden="true" />
                  </button>
                </div>
              </section>
            </div>
            <div v-if="undoSnapshot" class="my-2 flex justify-between text-xs" role="status">
              <span>已删除会话</span><button type="button" class="text-accent-soft" @click="assistant.undo()">
                撤销
              </button>
            </div>
            <div v-if="confirmClear" class="mt-3 text-sm">
              <p>清空全部会话？此操作无法撤销。</p><div class="mt-2 flex gap-3">
                <button type="button" class="text-error" @click="assistant.clear(); confirmClear = false">
                  确认清空
                </button><button type="button" @click="confirmClear = false">
                  取消
                </button>
              </div>
            </div>
            <button v-else type="button" class="mt-3 text-left text-xs text-muted" :disabled="!groups.length" @click="confirmClear = true">
              清空会话历史
            </button>
          </aside>
        </Transition>
        <button v-if="drawer" type="button" class="assistant-drawer-backdrop" tabindex="-1" aria-label="关闭会话列表" @click="drawer = false" />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.assistant-panel {
  --assistant-surface: color-mix(in srgb, var(--color-surface) 80%, transparent);
  --assistant-user-surface: color-mix(in srgb, var(--color-accent-surface) 80%, transparent);
  --assistant-glass-filter: blur(24px) saturate(1.3);
  position: fixed; inset: var(--assistant-top) 0 auto; width: 100%; max-width: none; height: var(--assistant-height); max-height: none; margin: 0; padding: 0; border: 0; background: transparent; color: var(--color-heading); overflow-y: auto; overscroll-behavior: contain; z-index: 80;
}
.assistant-panel::backdrop { background: transparent; }
.assistant-preparing :is(.assistant-greeting, .assistant-scene-ui, .assistant-user, .assistant-reply, .assistant-suggestion) { opacity: 0; }
.assistant-scene-background { position: fixed; inset: 0; z-index: -1; pointer-events: none; background: linear-gradient(rgba(0, 0, 0, .3) 0px, rgba(0, 0, 0, .9) 100%); }
.assistant-shell { min-height: 100%; padding: 76px 24px 48px; display: flex; flex-direction: column; }
.assistant-header { position: fixed; top: calc(var(--assistant-top) + 16px); left: 16px; right: 16px; z-index: 4; display: flex; gap: 8px; }
.assistant-icon { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; min-height: 40px; flex-shrink: 0; padding: 0; font-size: 20px; }
.assistant-header .assistant-icon { background: var(--assistant-surface); border: 1px solid var(--color-border-strong); backdrop-filter: var(--assistant-glass-filter); }
.assistant-workspace { position: relative; display: flex; flex: 1; min-height: calc(var(--assistant-height) - 124px); }
.assistant-main { display: flex; flex-direction: column; gap: 12px; width: min(760px, 100%); min-width: 0; min-height: calc(var(--assistant-height) - 124px); margin: 0 auto; }
.assistant-conversation { flex: 1; padding: 16px 0 32px; }
.assistant-dock { position: sticky; bottom: 48px; flex-shrink: 0; width: 100%; }
.assistant-main.is-empty { justify-content: center; padding-bottom: 5vh; }
.is-empty .assistant-conversation { flex: 0; padding: 0; }
.is-empty .assistant-dock { position: static; }
.assistant-welcome { text-align: center; margin: 0 auto 28px; }
.assistant-welcome h3 { font-size: clamp(28px, 4vw, 40px); margin-top: 16px; }
.assistant-questions { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin-bottom: 20px; }
.assistant-suggestion { border: 1px solid var(--color-border-strong); border-radius: 999px; padding: 7px 12px; font-size: 13px; text-align: left; }
.assistant-suggestion:hover { border-color: var(--color-accent); background: var(--color-accent-surface); }
.assistant-context { margin: 0; padding: 10px 14px; border: 1px solid rgba(255, 255, 255, .1); border-bottom: 0; border-radius: var(--radius-panel) var(--radius-panel) 0 0; font-size: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; background: rgba(255, 255, 255, .06); backdrop-filter: var(--assistant-glass-filter); }
.assistant-context strong { font-weight: 500; }
.assistant-login { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 10px; font-size: 12px; color: var(--color-muted); }
.assistant-context + .assistant-login { padding: 8px 14px; margin-bottom: 0; background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .1); border-bottom: 0; backdrop-filter: var(--assistant-glass-filter); }
.assistant-signin { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; padding: 4px; color: var(--color-heading); font-weight: 600; }
.assistant-composer { padding: 14px 18px 10px; background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .1); border-radius: var(--radius-panel); backdrop-filter: var(--assistant-glass-filter); box-shadow: var(--shadow-float); }
.assistant-context ~ .assistant-composer { border-radius: 0 0 var(--radius-panel) var(--radius-panel); }
.assistant-input { display: block; width: 100%; height: 38px; padding: 0; margin-bottom: 4px; background: transparent; outline: none; font-size: 16px; }
.assistant-input:focus-visible { outline: none; }
.assistant-composer:focus-within { border-color: var(--color-accent); }
.assistant-turn + .assistant-turn { margin-top: 28px; }
.assistant-user, .assistant-reply { border: 1px solid var(--color-border-strong); border-radius: var(--radius-panel); backdrop-filter: var(--assistant-glass-filter); box-shadow: var(--shadow-float); overflow-wrap: anywhere; line-height: 1.8; }
.assistant-user { width: fit-content; max-width: 75%; margin: 0 0 18px auto; padding: 12px 18px; background: var(--assistant-user-surface); white-space: pre-wrap; }
.assistant-reply { width: fit-content; max-width: 100%; min-width: 0; padding: 20px 24px; font-size: 15px; background: var(--assistant-surface); }
.assistant-validation { margin-top: 20px; }
.assistant-history { position: fixed; top: calc(var(--assistant-top) + 64px); bottom: 16px; left: 16px; z-index: 6; display: flex; flex-direction: column; width: min(280px, calc(100% - 48px)); padding: 16px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-panel); background: var(--assistant-surface); backdrop-filter: var(--assistant-glass-filter); box-shadow: var(--shadow-dialog); }
.assistant-history-row { display: flex; align-items: center; gap: 4px; padding: 6px 4px 6px 8px; border-radius: var(--radius-button); }
.assistant-history-row.selected { background: var(--color-accent-surface); }
.assistant-drawer-backdrop { position: fixed; inset: 0; z-index: 5; background: var(--color-scrim); }
.assistant-new-reply { position: fixed; bottom: 210px; right: max(24px, calc((100vw - 760px) / 2)); z-index: 3; padding: 6px 12px; border-radius: var(--radius-button); background: var(--assistant-surface); font-size: 12px; }
.assistant-reply-placeholder { display: flex; flex-direction: column; gap: 10px; padding: 8px 0; }
.assistant-reply-placeholder span { height: 8px; width: 55%; border-radius: 8px; background: var(--color-border); }
.assistant-reply-placeholder span + span { width: 32%; }
:global(html.light .assistant-scene-background) { background: linear-gradient(color-mix(in srgb, var(--color-canvas) 60%, transparent), color-mix(in srgb, var(--color-canvas) 98%, transparent)); }
:global(html.light .assistant-composer), :global(html.light .assistant-context), :global(html.light .assistant-context + .assistant-login) { background: var(--assistant-surface); border-color: var(--color-border-strong); }
.assistant-panel.is-floating { --assistant-floating-height: min(640px, calc(var(--assistant-height) - 32px)); inset: auto max(16px, env(safe-area-inset-right)) auto auto; top: calc(var(--assistant-top) + var(--assistant-height) - var(--assistant-floating-height) - max(16px, env(safe-area-inset-bottom))); width: min(410px, calc(100vw - 32px)); height: var(--assistant-floating-height); padding: 12px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-panel); background: var(--assistant-surface); box-shadow: var(--shadow-dialog); overflow: hidden; }
.is-floating .assistant-scene-background { display: none; }
.assistant-panel.is-floating { background: color-mix(in srgb, var(--color-surface) 96%, transparent); }
.is-floating .assistant-shell { height: 100%; min-height: 0; padding: 0; }
.is-floating .assistant-header { position: static; }
.is-floating .assistant-workspace { overflow: hidden; min-height: 0; padding-top: 8px; }
.is-floating .assistant-main { min-height: 0; padding-bottom: 0; justify-content: initial; }
.is-floating .assistant-conversation { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 4px 16px; }
.is-floating .assistant-dock { position: static; }
.is-floating .assistant-welcome { margin: 16px auto 20px; }
.is-floating .assistant-welcome h3 { font-size: 24px; }
.is-floating .assistant-login { font-size: 11px; gap: 6px; }
.is-floating .assistant-questions { margin-bottom: 12px; gap: 6px; }
.is-floating .assistant-history, .is-floating .assistant-drawer-backdrop { position: absolute; inset: 0 auto 0 0; }
.is-floating .assistant-drawer-backdrop { inset: 0; }
.is-floating .assistant-new-reply { position: absolute; right: 12px; bottom: 200px; }
.assistant-drawer-enter-active, .assistant-drawer-leave-active { transition: transform .24s, opacity .24s; }
.assistant-drawer-enter-from, .assistant-drawer-leave-to { transform: translateX(-100%); opacity: 0; }
@media (max-width: 600px) {
  .assistant-shell { padding: 68px 16px max(24px, env(safe-area-inset-bottom)); }
  .assistant-workspace, .assistant-main { min-height: calc(var(--assistant-height) - 92px); }
  .assistant-dock { bottom: max(24px, env(safe-area-inset-bottom)); }
  .assistant-login { font-size: 11px; }
  .assistant-user { max-width: 90%; }
  .assistant-reply { padding: 16px; }
}
@media (prefers-reduced-motion: reduce) { .assistant-drawer-enter-active, .assistant-drawer-leave-active { transition: none; } }
@supports not (backdrop-filter: blur(24px)) { .assistant-composer, .assistant-context, .assistant-context + .assistant-login, .assistant-reply, .assistant-history { background: var(--color-surface); } }
</style>
