<script setup lang="ts">
import { z } from 'zod'
import { previewContextSchema } from '#shared/admin/preview'
import { renderClientPreview } from '~/features/admin/preview-client'
import { createPreviewReceiver, previewChannelName } from '~/features/admin/preview-sync'

definePageMeta({ layout: 'default', section: 'posts', pageKind: 'detail', pageTitle: '文章预览', key: route => route.path })
const route = useRoute()
const id = z.uuid().safeParse(route.params.id)
const session = z.uuid().safeParse(route.query.session)
const editorPath = computed(() => id.success ? `/admin/editor/${id.data}` : '/admin')
const { current, request, refresh, localLogin, loginOpen } = useAdminSession()
const ready = ref(false)
const denied = ref(false)
const problem = ref('')
const showEditorLink = ref(false)
const receiver = shallowRef<ReturnType<typeof createPreviewReceiver> | null>(null)
const preview = computed(() => receiver.value?.preview.value)
const post = computed(() => preview.value ? { ...preview.value.data, body: preview.value.body } : null)
const allowed = computed(() => ready.value && !denied.value && current.value.user?.role === 'admin')
const status = computed(() => {
  if (receiver.value?.loading.value)
    return '正在更新预览…'
  if (receiver.value?.connection.value === 'live')
    return '实时预览 · 自动同步编辑内容'
  if (receiver.value?.connection.value === 'snapshot')
    return '上次预览快照 · 编辑器未连接'
  return '正在连接编辑器…'
})
const error = computed(() => problem.value || receiver.value?.error.value)
const permalink = usePageUrl(() => post.value?.path ?? '/posts')
useSeoMeta({ title: () => post.value ? `${post.value.title} · 预览` : '文章预览', robots: 'noindex, nofollow' })
useHead({ link: [{ key: 'canonical', rel: 'canonical', href: permalink }] })
function dispose(clear = false) {
  if (clear)
    receiver.value?.forget()
  receiver.value?.stop()
  receiver.value = null
}
async function authenticate() {
  problem.value = ''
  try {
    if (!await refresh())
      throw new Error('无法确认登录状态，请检查连接后重试。')
    if (!current.value.user && current.value.localAvailable)
      await localLogin()
    denied.value = false
    ready.value = true
  }
  catch (cause) {
    dispose()
    ready.value = false
    problem.value = cause instanceof Error ? cause.message : '无法确认登录状态。'
  }
}
watch([allowed, () => current.value.user?.id], () => {
  dispose(true)
  if (!allowed.value)
    return
  if (!id.success || !session.success) {
    problem.value = '预览地址无效，请从编辑器重新打开预览。'
    return
  }
  try {
    const name = previewChannelName(current.value.user!.id, id.data, session.data)
    receiver.value = createPreviewReceiver({
      channel: new BroadcastChannel(name),
      key: name,
      storage: {
        getItem: key => sessionStorage.getItem(key),
        setItem: (key, value) => sessionStorage.setItem(key, value),
        removeItem: key => sessionStorage.removeItem(key),
      },
      async load(snapshot) {
        const context = previewContextSchema.parse(await request(`drafts/${id.data}/preview`, { method: 'POST', body: { source: snapshot.source, summaryText: snapshot.summaryText } }))
        return renderClientPreview(snapshot.source, context)
      },
      errorMessage: cause => cause instanceof Error && !('data' in cause) ? cause.message : adminError(cause),
      onUnauthorized() { denied.value = true },
    })
  }
  catch { problem.value = '无法连接实时预览，请使用支持 BroadcastChannel 的浏览器。' }
})
function returnToEditor() {
  window.close()
  // Browsers that disallow closing a manually opened tab keep this link usable.
  showEditorLink.value = true
}
async function resume() {
  await authenticate()
  receiver.value?.connect()
}
useActionButton({ id: 'back', icon: 'i-lucide-arrow-left', label: '返回编辑器', order: 30, onClick: returnToEditor })
onMounted(() => {
  void authenticate()
  window.addEventListener('focus', resume)
})
onBeforeUnmount(() => {
  dispose()
  window.removeEventListener('focus', resume)
})
</script>

<template>
  <div>
    <div class="mb-6 flex flex-wrap items-center gap-3 rounded-panel bg-surface px-4 py-3 text-xs text-muted">
      <span role="status" class="flex-1">{{ allowed ? status : ready ? '预览仅限管理员查看' : '正在确认登录状态…' }}</span>
      <button v-if="allowed" class="text-link" @click="receiver?.connect()">
        重新连接
      </button>
      <button v-else class="text-link" @click="authenticate">
        重新验证
      </button>
      <button v-if="ready && !current.user && current.ssoAvailable" class="text-link" @click="loginOpen = true">
        登录
      </button>
      <button class="text-link" @click="returnToEditor">
        返回编辑器
      </button>
      <NuxtLink v-if="showEditorLink" :to="editorPath" class="text-link">
        打开编辑器
      </NuxtLink>
    </div>
    <p v-if="error" role="alert" class="mb-6 text-sm text-error">
      {{ error }}
      <button v-if="allowed" class="text-link ml-2" @click="receiver?.retry()">
        重试
      </button>
    </p>
    <ArticlePage v-if="allowed && post && preview" :post="post" :links="preview.toc?.links ?? []" :content-key="`${id.data}:${receiver?.revision.value}`" />
    <AdminSkeleton v-else-if="allowed && !error" label="正在生成文章预览…" />
  </div>
</template>
