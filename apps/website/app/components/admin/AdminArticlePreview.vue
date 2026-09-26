<script setup lang="ts">
import type { ArticlePreview } from '#shared/admin/preview'
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { accentVariables, normalizeAccent } from '#shared/theme/palette'
import { revealContent } from '~/features/collapse/reveal'
import { findHeading } from '~/features/toc/useScrollspy'

const props = defineProps<{ draftId: string, source: string, summaryText?: string }>()
const open = defineModel<boolean>({ default: false })
const { request } = useAdminSession()
const mode = useColorMode()
const width = ref<'desktop' | 'mobile'>('desktop')
const viewport = useTemplateRef<HTMLElement>('viewport')
const preview = shallowRef<ArticlePreview | null>(null)
const loading = ref(false)
const error = ref('')
let sequence = 0
const theme = computed(() => {
  const color = normalizeAccent(preview.value?.data.theme)
  const variables = accentVariables(color)
  return { ...variables, '--color-accent-text': variables[mode.value === 'light' ? '--accent-light-text' : '--accent-dark-text'], '--color-title': mode.value === 'light' ? variables['--accent-light-text'] : color }
})
async function load() {
  const current = ++sequence
  loading.value = true
  error.value = ''
  try {
    const result = await request<ArticlePreview>(`drafts/${props.draftId}/preview`, { method: 'POST', body: { source: props.source, summaryText: props.summaryText } })
    if (current === sequence && open.value)
      preview.value = result
  }
  catch (cause) {
    if (current === sequence)
      error.value = adminError(cause)
  }
  finally {
    if (current === sequence)
      loading.value = false
  }
}
watch(open, (value) => {
  sequence++
  if (value) {
    preview.value = null
    void load()
  }
})
onBeforeUnmount(() => sequence++)
async function followLink(event: MouseEvent) {
  const anchor = event.target instanceof Element ? event.target.closest('a') : null
  if (!anchor)
    return
  event.preventDefault()
  event.stopPropagation()
  const href = anchor.getAttribute('href') ?? ''
  if (href.startsWith('#')) {
    let id: string
    try {
      id = decodeURIComponent(href.slice(1))
    }
    catch { return }
    const heading = findHeading(id, viewport.value)
    if (heading && viewport.value) {
      if (!await revealContent(heading) || !open.value || !viewport.value?.contains(heading))
        return
      viewport.value.scrollTo({ top: heading.getBoundingClientRect().top - viewport.value.getBoundingClientRect().top + viewport.value.scrollTop - 24, behavior: 'instant' })
      heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
    }
  }
  else if (/^https?:$/.test(new URL(anchor.href, window.location.href).protocol)) {
    window.open(anchor.href, '_blank', 'noopener,noreferrer')
  }
}
</script>

<template>
  <AcrylicDialog v-model="open" title="文章预览" placement="preview">
    <template #actions>
      <div class="flex items-center gap-1" role="group" aria-label="预览宽度">
        <button v-for="item in (['desktop', 'mobile'] as const)" :key="item" class="icon-button" :class="{ 'control-selected': width === item }" :aria-label="item === 'desktop' ? '桌面宽度' : '手机宽度'" :aria-pressed="width === item" @click="width = item">
          <span :class="item === 'desktop' ? 'i-lucide-monitor' : 'i-lucide-smartphone'" aria-hidden="true" />
        </button>
      </div>
    </template>
    <div v-if="open" class="h-full min-h-0 flex flex-col gap-3">
      <div class="flex shrink-0 items-center justify-between gap-3 text-xs text-muted">
        <p role="status">
          当前编辑内容 · 预览不会发布文章
        </p>
        <BaseButton variant="ghost" :loading="loading" @click="load">
          刷新预览
        </BaseButton>
      </div>
      <div v-if="error" role="alert" class="flex shrink-0 items-center gap-3 border border-error rounded-button p-3 text-error">
        <span class="flex-1">{{ error }}</span><BaseButton variant="border" :loading="loading" @click="load">
          重试
        </BaseButton>
      </div>
      <AdminSkeleton v-if="loading && !preview" label="正在生成文章预览…" />
      <div v-if="preview" class="preview-frame mx-auto min-h-0 w-full flex-1 overflow-hidden border border-line rounded-panel bg-canvas" :class="{ 'max-w-[390px]': width === 'mobile' }" :style="theme" :aria-busy="loading">
        <div ref="viewport" class="preview-scroll h-full overflow-y-auto overscroll-contain">
          <div class="preview-layout">
            <aside v-if="preview.toc?.links.length" class="preview-toc">
              <ContentToc :links="preview.toc.links" :scroll-root="viewport" layout="container" :collapsed-rows="3" highlight highlight-variant="circuit" />
            </aside>
            <article class="preview-article min-w-0" @click.capture="followLink">
              <ArticleHeader :post="preview.data" preview />
              <ArticleSummary v-if="preview.data.summarySource === 'ai'" :text="preview.data.description" />
              <ArticleBody :content-key="JSON.stringify(preview)">
                <ContentRenderer :value="{ ...preview.data, body: preview.body }" />
              </ArticleBody>
            </article>
          </div>
        </div>
      </div>
    </div>
  </AcrylicDialog>
</template>

<style scoped>
.preview-frame {
  container: article-preview / inline-size;
  --color-accent-surface: color-mix(in srgb, var(--color-accent) 10%, transparent);
  --color-accent-hover: color-mix(in srgb, var(--color-accent) 90%, white);
  --color-accent-pressed: color-mix(in srgb, var(--color-accent) 18%, transparent);
}
.preview-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 32px;
  max-width: 1200px;
  margin: auto;
  padding: 40px 32px;
  align-items: start;
}
.preview-article { grid-column: 2; }
.preview-toc { position: sticky; top: 24px; max-height: calc(80dvh - 100px); overflow-y: auto; }
@container article-preview (max-width: 850px) {
  .preview-layout { display: flex; flex-direction: column; padding: 24px 20px; gap: 24px; }
  .preview-toc { position: relative; top: auto; width: 100%; max-height: none; }
  .preview-article { width: 100%; }
  .preview-article :deep(h1) { font-size: 2rem; }
  .preview-article :deep([aria-label='AI 摘要']) { padding: 20px; }
  .preview-article :deep([aria-label='文章标签'] a) { min-height: 44px; }
}
</style>
