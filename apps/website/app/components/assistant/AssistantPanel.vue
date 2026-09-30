<script setup lang="ts">
import { useEventListener, useScrollLock } from '@vueuse/core'

const assistant = useAssistant()!
const { mode, drawer, currentId, turns, draft, page, pageTitle, active, error, storageWarning, limited, groups, busy, busyElsewhere, enabled, undoSnapshot, navigationResults, actionBusy, session } = assistant
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const input = useTemplateRef<HTMLTextAreaElement>('input')
const list = useTemplateRef<HTMLElement>('list')
const drawerElement = useTemplateRef<HTMLElement>('drawerElement')
const historyButton = useTemplateRef<HTMLButtonElement>('historyButton')
const locked = useScrollLock(document.body)
const token = ref('')
const challengeReset = ref(0)
const confirmClear = ref(false)
const nearBottom = ref(true)
const newReply = ref(false)
const viewport = ref({ height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 })
let previousFocus: HTMLElement | null = null
let disposed = false
let backdropPressed = false
useActionButton({ id: 'assistant', icon: 'i-lucide-sparkles', label: '有问题？来试试这个！', unread: assistant.unread, order: 15, visible: computed(() => enabled.value && mode.value === 'hidden'), onClick: () => assistant.open() })
function updateViewport() {
  viewport.value = { height: window.visualViewport?.height ?? window.innerHeight, top: window.visualViewport?.offsetTop ?? 0 }
}
useEventListener(window, 'resize', updateViewport)
useEventListener(window.visualViewport, 'resize', updateViewport)
useEventListener(window.visualViewport, 'scroll', updateViewport)
watch(mode, async (value, previous) => {
  backdropPressed = false
  if (previous === 'hidden' && value !== 'hidden')
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  if (disposed || !dialog.value)
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
})
watch(drawer, async (value) => {
  confirmClear.value = false
  await nextTick()
  if (value)
    drawerElement.value?.querySelector<HTMLButtonElement>('button')?.focus()
  else historyButton.value?.focus({ preventScroll: true })
})
function scrollBottom() {
  if (list.value)
    list.value.scrollTop = list.value.scrollHeight
  nearBottom.value = true
  newReply.value = false
}
function onScroll() {
  const element = list.value
  nearBottom.value = !!element && element.scrollHeight - element.scrollTop - element.clientHeight < 48
  if (nearBottom.value)
    newReply.value = false
}
watch([() => turns.value.length, () => turns.value.at(-1)?.status], async () => {
  await nextTick()
  if (nearBottom.value)
    scrollBottom()
  else newReply.value = true
})
watch(currentId, async () => {
  await nextTick()
  scrollBottom()
})
watch([assistant.queuedSend, token, () => session.value?.authenticated, busy], () => {
  if (assistant.queuedSend.value && !busy.value && (session.value?.authenticated || token.value))
    void send()
})
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
  if (!draft.value.trim() || busy.value)
    return
  await assistant.send(token.value || undefined)
  token.value = ''
  challengeReset.value++
}
function inputKey(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229)
    return
  event.preventDefault()
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
  <dialog ref="dialog" class="assistant-panel" :class="{ 'is-floating': mode === 'floating' }" :style="{ '--assistant-height': `${viewport.height}px`, '--assistant-top': `${viewport.top}px` }" aria-labelledby="assistant-heading" data-assistant-backdrop @pointerdown="pressBackdrop" @pointercancel="backdropPressed = false" @click="closeOnBackdrop" @keydown="keydown" @cancel.prevent="drawer ? drawer = false : assistant.close()">
    <div class="assistant-shell" data-assistant-backdrop>
      <header class="assistant-header" data-assistant-backdrop>
        <button ref="historyButton" class="assistant-icon control-base control-quiet" type="button" title="会话列表" aria-label="会话列表" :aria-expanded="drawer" aria-controls="assistant-history" @click="drawer = !drawer">
          <span class="i-lucide-panel-left" aria-hidden="true" />
        </button>
        <h2 id="assistant-heading" class="assistant-heading">
          AI 对话助手
        </h2>
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
        <main class="assistant-main" :inert="drawer || undefined" data-assistant-backdrop>
          <p v-if="page.path" class="assistant-context">
            当前文章 · {{ pageTitle || page.path }}
          </p>
          <div ref="list" class="assistant-conversation" aria-label="聊天记录" tabindex="0" data-assistant-backdrop @scroll="onScroll">
            <div v-if="!turns.length" class="assistant-welcome">
              <span class="i-lucide-sparkles text-3xl text-accent-soft" aria-hidden="true" />
              <p>我是 Setobox Blog 的 AI 对话助手。可以帮你找文章、解释内容，或回顾这次聊天。</p>
              <div class="mt-5 flex flex-wrap justify-center gap-2">
                <button class="assistant-suggestion" type="button" @click="draft = '这篇文章讲了什么？'">
                  这篇文章讲了什么？
                </button>
                <button class="assistant-suggestion" type="button" @click="draft = '有哪些文章分类？'">
                  浏览分类
                </button>
                <button class="assistant-suggestion" type="button" @click="draft = '介绍一下作者'">
                  了解作者
                </button>
              </div>
            </div>
            <article v-for="turn in turns" :key="turn.id" class="assistant-turn" data-assistant-backdrop>
              <p class="assistant-user">
                {{ turn.user }}
              </p>
              <div v-if="turn.record" class="assistant-reply">
                <div class="mb-2 flex items-center gap-2 text-xs text-muted">
                  <span class="i-lucide-sparkles" aria-hidden="true" />
                </div>
                <template v-for="(block, blockIndex) in turn.record.assistant.blocks" :key="blockIndex">
                  <AssistantText v-if="block.type === 'text'" :text="block.text" />
                  <div v-else-if="block.type === 'article_list'" class="assistant-cards">
                    <NuxtLink v-for="item in block.items" :key="item.articleId" :to="item.path" class="assistant-card">
                      <strong>{{ item.title }}</strong><span>{{ item.description }}</span><span class="text-accent-soft">阅读文章 →</span>
                    </NuxtLink>
                  </div>
                  <div v-else-if="block.type === 'taxonomy_list'" class="mt-3 flex flex-wrap gap-2">
                    <NuxtLink v-for="item in block.items" :key="item.path" :to="item.path" class="assistant-suggestion">
                      {{ item.name }} · {{ item.count }}
                    </NuxtLink>
                  </div>
                  <div v-else-if="block.type === 'navigation_confirmation'" class="mt-3">
                    <p v-if="navigationResults[block.actionId]" class="text-xs text-muted">
                      {{ { succeeded: '已打开文章', failed: '打开失败，请重新选择', cancelled: '已取消打开' }[navigationResults[block.actionId]!] }}
                    </p>
                    <button v-else class="assistant-suggestion" type="button" :disabled="actionBusy || block.expiresAt < Date.now()" @click="assistant.navigateAction(block.actionId, turn.conversationId, true)">
                      打开《{{ block.target.title }}》
                    </button>
                  </div>
                  <p v-else-if="block.type === 'navigation_result'" class="text-xs text-muted">
                    {{ { succeeded: '已打开文章', failed: '打开失败', cancelled: '已取消打开' }[block.status] }}
                  </p>
                </template>
                <div v-if="turn.record.assistant.references.length" class="mt-3 border-t border-line pt-2 text-xs text-muted">
                  参考文章：<NuxtLink v-for="reference in turn.record.assistant.references" :key="`${reference.articleId}:${reference.sectionId}`" class="mr-2 hover:text-accent-soft" :to="`${reference.path}${reference.sectionId ? `#${encodeURIComponent(reference.sectionId)}` : ''}`">
                    {{ reference.title }}
                  </NuxtLink>
                </div>
              </div>
              <p v-else class="assistant-status" role="status">
                {{ turn.status === 'pending' ? '正在阅读与整理，回答检查通过后会显示…' : turn.error || { completed: '', failed: '回答未完成，请重新提问', interrupted: '本次回答已中断', cancelled: '本次生成已停止' }[turn.status] }}
              </p>
            </article>
          </div>
          <button v-if="newReply" class="assistant-new-reply" type="button" @click="scrollBottom">
            有新回复 ↓
          </button>
          <div class="assistant-composer">
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
              <textarea ref="input" v-model="draft" class="assistant-input" rows="2" maxlength="500" placeholder="输入问题，Shift + Enter 换行" aria-label="向助手提问" @keydown="inputKey" />
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-muted">{{ draft.length }}/500</span>
                <button v-if="active" class="assistant-icon control-base control-quiet" type="button" title="停止生成" aria-label="停止生成" @click="assistant.stop()">
                  <span class="i-lucide-square" aria-hidden="true" />
                </button>
                <button v-else class="assistant-icon control-base control-quiet bg-accent-surface" type="submit" :disabled="busy || !draft.trim() || (!session?.authenticated && !token)" title="发送消息" aria-label="发送消息">
                  <span class="i-lucide-arrow-up" aria-hidden="true" />
                </button>
              </div>
            </form>
            <AssistantChallenge v-if="session?.enabled && !session.authenticated && mode !== 'hidden'" class="mt-2" :site-key="session.turnstileSiteKey" :reset="challengeReset" @token="token = $event" />
            <p class="mt-2 text-center text-[11px] text-muted">
              回答可能有误，请结合引用核实。
            </p>
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
  --assistant-surface-opacity: 70%;
  --assistant-shell-opacity: 45%;
  --assistant-surface: color-mix(in srgb, var(--color-surface) var(--assistant-surface-opacity), transparent);
  --assistant-user-tint: color-mix(in srgb, var(--color-surface) 84%, var(--color-accent));
  --assistant-user-surface: color-mix(in srgb, var(--assistant-user-tint) var(--assistant-surface-opacity), transparent);
  --assistant-shell-surface: color-mix(in srgb, var(--color-surface) var(--assistant-shell-opacity), transparent);
  --assistant-glass-filter: blur(24px) saturate(125%);
  position: fixed; inset: var(--assistant-top) 0 auto; z-index: 80; width: 100%; max-width: none; height: var(--assistant-height); max-height: none; margin: 0; padding: 16px; border: 0; background: transparent; color: var(--color-heading);
}
:root.light .assistant-panel { --assistant-surface-opacity: 80%; --assistant-shell-opacity: 60%; }
.assistant-panel::backdrop { background: rgb(0 0 0 / 60%); backdrop-filter: none; }
.assistant-shell { display: flex; flex-direction: column; height: 100%; }
.assistant-header { display: flex; align-items: center; gap: 8px; flex-shrink: 0; color: var(--color-heading); }
.assistant-heading { padding: 8px 12px; border-radius: var(--radius-button); font-size: 14px; white-space: nowrap; }
.assistant-icon { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; min-height: 40px; flex-shrink: 0; padding: 0; font-size: 20px; }
.assistant-icon:disabled { opacity: .4; }
.assistant-header .assistant-icon, .assistant-heading, .assistant-context { background: var(--assistant-surface); backdrop-filter: var(--assistant-glass-filter); border: 1px solid var(--color-border-strong); }
.assistant-workspace { position: relative; display: flex; flex: 1; min-height: 0; overflow: hidden; padding-top: 12px; }
.assistant-main { position: relative; display: flex; flex-direction: column; gap: 12px; width: min(1100px, 100%); min-width: 0; min-height: 0; margin: 0 auto; }
.assistant-context { align-self: center; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; font-size: 12px; padding: 6px 12px; border-radius: var(--radius-button); }
.assistant-user, .assistant-reply, .assistant-status, .assistant-welcome, .assistant-composer { border: 1px solid var(--color-border-strong); border-radius: var(--radius-panel); background: var(--assistant-surface); backdrop-filter: var(--assistant-glass-filter); box-shadow: var(--shadow-float); }
.assistant-conversation { flex: 1; min-height: 0; padding: 12px 16px 20px; overflow-y: auto; overscroll-behavior: contain; background: transparent; }
.assistant-composer { flex-shrink: 0; width: 100%; min-width: 0; padding: 16px 20px; }
.assistant-input { display: block; width: 100%; resize: none; max-height: 140px; padding: 4px 0; background: transparent; line-height: 1.7; }
.assistant-welcome { max-width: 430px; margin: 8vh auto 24px; padding: 24px; text-align: center; }
.assistant-welcome h3 { margin: 16px 0 8px; color: var(--color-heading); font-size: 22px; }
.assistant-welcome p { margin-top: 12px; font-size: 14px; line-height: 1.8; }
.assistant-suggestion { display: inline-block; max-width: 100%; border: 1px solid var(--color-border-strong); border-radius: var(--radius-button); padding: 7px 12px; font-size: 13px; text-align: left; overflow-wrap: anywhere; background: var(--color-accent-surface); }
.assistant-turn { width: 100%; max-width: 1000px; min-width: 0; margin: 0 auto; }
.assistant-turn + .assistant-turn { margin-top: 28px; }
.assistant-user { width: fit-content; max-width: 75%; margin: 0 0 18px auto; padding: 12px 18px; background: var(--assistant-user-surface); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; }
.assistant-reply { width: fit-content; max-width: 100%; min-width: 0; padding: 20px 24px; font-size: 15px; overflow-wrap: anywhere; }
.assistant-status { width: fit-content; max-width: 100%; padding: 14px 18px; font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
.assistant-cards { display: grid; gap: 8px; margin-top: 12px; }
.assistant-card { display: flex; flex-direction: column; gap: 5px; min-width: 0; padding: 12px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-button); background: color-mix(in srgb, var(--color-surface) 35%, transparent); }
.assistant-card span { font-size: 12px; }
.assistant-card:hover, .assistant-suggestion:hover { border-color: var(--color-accent); background: var(--color-accent-surface); }
.assistant-history { position: absolute; inset: 0 auto 0 0; z-index: 2; display: flex; flex-direction: column; width: min(280px, calc(100% - 48px)); padding: 16px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-panel); background: var(--assistant-surface); backdrop-filter: var(--assistant-glass-filter); box-shadow: var(--shadow-dialog); }
.assistant-history-row { display: flex; align-items: center; gap: 4px; padding: 6px 4px 6px 8px; border-radius: var(--radius-button); }
.assistant-history-row.selected { background: var(--color-accent-surface); }
.assistant-drawer-backdrop { position: absolute; inset: 0; z-index: 1; background: var(--color-scrim); }
.assistant-new-reply { position: absolute; right: 24px; top: 16px; padding: 6px 12px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-button); background: var(--assistant-surface); backdrop-filter: var(--assistant-glass-filter); font-size: 12px; }
.assistant-header .assistant-icon, .assistant-heading, .assistant-context, .assistant-user, .assistant-reply, .assistant-status, .assistant-welcome, .assistant-composer, .assistant-history, .assistant-new-reply { -webkit-backdrop-filter: var(--assistant-glass-filter); }
.assistant-panel.is-floating { --assistant-floating-height: min(640px, calc(var(--assistant-height) - 32px)); inset: auto max(16px, env(safe-area-inset-right)) auto auto; top: calc(var(--assistant-top) + var(--assistant-height) - var(--assistant-floating-height) - max(16px, env(safe-area-inset-bottom))); width: min(410px, calc(100vw - 32px)); height: var(--assistant-floating-height); padding: 12px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-panel); background: var(--assistant-shell-surface); box-shadow: var(--shadow-dialog); }
.is-floating .assistant-main { gap: 8px; }
.is-floating .assistant-workspace { padding-top: 8px; }
.is-floating .assistant-conversation { padding: 8px 4px 12px; }
.is-floating .assistant-composer { padding: 10px 12px; }
.is-floating .assistant-heading { padding: 8px; }
.is-floating .assistant-user { max-width: 90%; padding: 10px 14px; }
.is-floating .assistant-reply { padding: 14px 16px; font-size: 14px; }
.is-floating .assistant-welcome { margin-top: 16px; padding: 20px 16px; }
.is-floating .assistant-welcome h3 { font-size: 18px; }
.assistant-drawer-enter-active, .assistant-drawer-leave-active { transition: transform var(--duration-interaction) var(--ease-interaction), opacity var(--duration-interaction); }
.assistant-drawer-enter-from, .assistant-drawer-leave-to { transform: translateX(-100%); opacity: 0; }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .assistant-panel, :root.light .assistant-panel { --assistant-surface-opacity: 96%; --assistant-shell-opacity: 94%; }
}
@media (max-width: 600px) {
  .assistant-panel { padding: 8px; }
  .assistant-conversation { padding: 8px 4px 16px; }
  .assistant-main { gap: 8px; }
  .assistant-heading { padding: 8px; }
  .assistant-user { max-width: 90%; padding: 10px 14px; }
  .assistant-reply { padding: 16px; font-size: 14px; }
  .assistant-composer { padding: 12px 16px; }
  .assistant-welcome { padding: 20px 16px; }
}
@media (prefers-reduced-motion: reduce) { .assistant-drawer-enter-active, .assistant-drawer-leave-active { transition: none; } }
</style>
