<script setup lang="ts">
// Adapted from https://github.com/nuxt/ui/blob/v4.6.0/src/runtime/components/content/ContentToc.vue
// Copyright (c) 2023 NuxtLabs (MIT); see THIRD_PARTY_NOTICES.md.
import type { VNode } from 'vue'
import type { ContentTocLink, ContentTocProps } from '~/features/toc/model'
import { createReusableTemplate, useElementSize, usePreferredReducedMotion, useResizeObserver } from '@vueuse/core'
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui'
import { computed, nextTick, onScopeDispose, ref, useTemplateRef, watch } from 'vue'
import { useNuxtApp, useRoute, useRouter } from '#app'
import AppIcon from '~/components/AppIcon.vue'
import { circuitMask, flattenToc, tocLinkHeight, tocPreviewHeight } from '~/features/toc/model'
import { findHeading, useScrollspy } from '~/features/toc/useScrollspy'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<ContentTocProps>(), {
  links: () => [],
  title: '文章目录',
  highlight: false,
  highlightVariant: 'straight',
  open: undefined,
  defaultOpen: false,
  collapsedRows: 0,
  layout: 'viewport',
})
const emit = defineEmits<{ 'update:open': [value: boolean], 'move': [id: string] }>()
const slots = defineSlots<{
  leading?: (props: { open: boolean }) => VNode[]
  default?: (props: { open: boolean }) => VNode[]
  trailing?: (props: { open: boolean }) => VNode[]
  content?: (props: { links: ContentTocLink[] }) => VNode[]
  link?: (props: { link: ContentTocLink }) => VNode[]
  top?: (props: { links: ContentTocLink[] }) => VNode[]
  bottom?: (props: { links: ContentTocLink[] }) => VNode[]
}>()
const internalOpen = ref(props.defaultOpen)
const expanded = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value
    emit('update:open', value)
  },
})
const router = useRouter()
const route = useRoute()
const nuxtApp = useNuxtApp()
const flattened = computed(() => flattenToc(props.links))
const { activeHeadings, refresh } = useScrollspy(() => flattened.value.map(({ link }) => link.id), () => props.scrollRoot)
const stopLoading = nuxtApp.hooks.hook('page:loading:end', refresh)
const stopTransition = nuxtApp.hooks.hook('page:transition:finish', refresh)
onScopeDispose(() => {
  stopLoading()
  stopTransition()
})
watch(() => route.path, () => {
  expanded.value = false
  refresh()
}, { flush: 'post' })

const [DefineList, ReuseList] = createReusableTemplate<{ links: ContentTocLink[], level: number }>()
const [DefineTrigger, ReuseTrigger] = createReusableTemplate<{ open: boolean }>()
const [DefineContent, ReuseContent] = createReusableTemplate()
const mask = computed(() => props.highlightVariant === 'circuit' ? circuitMask(props.links) : undefined)
const indicator = computed(() => {
  const active = flattened.value.flatMap(({ link }, index) => activeHeadings.value.includes(link.id) ? [index] : [])
  const first = active[0]
  const last = active.at(-1)
  if (first === undefined || last === undefined)
    return undefined
  return {
    '--indicator-size': `${(last - first + 1) * tocLinkHeight}rem`,
    '--indicator-position': `${first * tocLinkHeight}rem`,
  }
})

const previewHeight = computed(() => tocPreviewHeight(props.links, props.collapsedRows))
const previewEnabled = computed(() => previewHeight.value > 0)
const previewViewport = useTemplateRef<HTMLElement>('previewViewport')
const previewList = useTemplateRef<HTMLElement>('previewList')
const { height: listHeight } = useElementSize(previewList)
const reducedMotion = usePreferredReducedMotion()
const firstActiveIndex = computed(() => flattened.value.findIndex(({ link }) => activeHeadings.value.includes(link.id)))
const contentHeight = computed(() => expanded.value
  ? listHeight.value > 0 ? `${listHeight.value}px` : `${flattened.value.length * tocLinkHeight}rem`
  : `${previewHeight.value}rem`)
let positioned = false

function followActive(behavior: ScrollBehavior) {
  const viewport = previewViewport.value
  const list = previewList.value
  // Hidden desktop copies have no layout; never scroll them or the document.
  if (!previewEnabled.value || expanded.value || !viewport?.clientHeight || !list)
    return
  const link = list.querySelectorAll<HTMLElement>('[data-slot="link"]')[firstActiveIndex.value]
  if (!link)
    return
  const rect = link.getBoundingClientRect()
  const center = rect.top - list.getBoundingClientRect().top + rect.height / 2
  const top = Math.max(0, Math.min(center - viewport.clientHeight / 2, viewport.scrollHeight - viewport.clientHeight))
  if (Math.abs(viewport.scrollTop - top) > 0.5)
    viewport.scrollTo({ top, behavior })
  positioned = true
}

watch([() => route.path, flattened], () => {
  positioned = false
  previewViewport.value?.scrollTo({ top: 0, behavior: 'instant' })
}, { flush: 'post' })
watch([firstActiveIndex, expanded, previewEnabled], ([index, isOpen], [, wasOpen]) => {
  if (isOpen && !wasOpen && previewEnabled.value) {
    // Cancel an in-flight smooth follow when the reader opens the full list.
    const viewport = previewViewport.value
    viewport?.scrollTo({ top: viewport.scrollTop, behavior: 'instant' })
    return
  }
  if (index < 0) {
    positioned = false
    return
  }
  followActive(positioned && !wasOpen && reducedMotion.value !== 'reduce' ? 'smooth' : 'instant')
}, { flush: 'post' })
// Reposition as the viewport shrinks, and when a hidden small-screen copy appears.
// ResizeObserver is disposed with the component; manual scrolling does not trigger it.
useResizeObserver(previewViewport, () => followActive('instant'))

async function scrollToHeading(id: string) {
  const path = route.path
  if (props.scrollRoot === undefined)
    await router.push(`#${encodeURIComponent(id)}`)
  emit('move', id)
  await nextTick()
  if (route.path !== path)
    return
  const heading = findHeading(id, props.scrollRoot)
  if (heading && props.scrollRoot) {
    props.scrollRoot.scrollTo({ top: heading.getBoundingClientRect().top - props.scrollRoot.getBoundingClientRect().top + props.scrollRoot.scrollTop - 24, behavior: 'instant' })
  }
  else { heading?.scrollIntoView({ block: 'start', behavior: 'instant' }) }
  heading?.setAttribute('tabindex', '-1')
  heading?.focus({ preventScroll: true })
}
</script>

<template>
  <DefineList v-slot="{ links: listLinks, level }">
    <ul
      class="m-0 min-w-0 list-none p-0"
      :class="level > 0 ? 'ml-3' : highlight ? 'pl-6.5' : ''"
    >
      <li v-for="link in listLinks" :key="link.id" class="min-w-0">
        <a
          :href="`#${encodeURIComponent(link.id)}`"
          data-slot="link"
          :aria-current="activeHeadings.includes(link.id) ? 'location' : undefined"
          class="ui-link relative flex items-center rounded-chip py-1 text-sm leading-5 focus-visible:outline-offset-0"
          :class="activeHeadings.includes(link.id) ? 'text-accent-soft' : 'text-muted'"
          @click.prevent="scrollToHeading(link.id)"
        >
          <slot name="link" :link="link">
            <span class="truncate" data-slot="linkText" :title="link.text">{{ link.text }}</span>
          </slot>
        </a>
        <ReuseList v-if="link.children?.length" :links="link.children" :level="level + 1" />
      </li>
    </ul>
  </DefineList>

  <DefineTrigger v-slot="{ open: isOpen }">
    <slot name="leading" :open="isOpen" />
    <span class="truncate" data-slot="title"><slot :open="isOpen">{{ title }}</slot></span>
    <span class="ml-auto inline-flex shrink-0 items-center gap-1.5">
      <slot name="trailing" :open="isOpen">
        <AppIcon name="down" class="transition-transform duration-200 ease-out lg:hidden size-4! motion-reduce:transition-none" :class="{ 'rotate-180': isOpen }" />
      </slot>
    </span>
  </DefineTrigger>

  <DefineContent>
    <div
      v-if="highlight"
      aria-hidden="true"
      data-slot="indicator"
      class="pointer-events-none absolute left-2.5 top-0"
      :class="highlightVariant === 'straight' ? 'h-full w-px' : ''"
      :style="[mask, indicator]"
    >
      <div class="absolute inset-0 bg-line" data-slot="indicatorLine" />
      <div
        v-if="indicator"
        data-slot="indicatorActive"
        class="absolute h-[var(--indicator-size)] w-full translate-y-[var(--indicator-position)] bg-accent transition-[transform,height] duration-200 ease-out motion-reduce:transition-none"
      />
    </div>
    <slot name="content" :links="links">
      <ReuseList :links="links" :level="0" />
    </slot>
  </DefineContent>

  <CollapsibleRoot
    v-if="links.length || slots.top || slots.bottom"
    v-bind="$attrs"
    v-model:open="expanded"
    as="nav"
    :aria-label="title"
    data-slot="root"
    :data-layout="layout"
    :style="previewEnabled ? { '--toc-trigger-height': 'var(--toc-preview-trigger-height)', '--toc-block-padding': 'var(--toc-preview-block-padding)' } : undefined"
    class="min-w-0 border-b border-line border-dashed bg-acrylic backdrop-blur-sm lg:border-0 lg:bg-transparent lg:backdrop-blur-none"
  >
    <div class="flex flex-col py-[var(--toc-block-padding)] lg:py-0" data-slot="container">
      <div v-if="slots.top" class="mb-4" data-slot="top">
        <slot name="top" :links="links" />
      </div>
      <template v-if="links.length">
        <CollapsibleTrigger data-slot="trigger" class="min-h-[var(--toc-trigger-height)] flex items-center gap-1.5 rounded-sm text-left text-heading font-semibold lg:hidden" :class="previewEnabled ? 'text-[0.75rem] leading-4' : 'text-sm'">
          <ReuseTrigger :open="expanded" />
        </CollapsibleTrigger>
        <CollapsibleContent data-slot="content" :force-mount="previewEnabled" class="overflow-hidden lg:hidden" :class="{ 'toc-content': !previewEnabled }">
          <div
            ref="previewViewport"
            data-slot="viewport"
            class="[overflow-anchor:none] max-h-[min(60dvh,calc(100dvh-var(--header-height)-8rem))] overflow-y-auto overscroll-y-contain"
            :class="{ 'toc-preview': previewEnabled }"
            :style="previewEnabled ? { height: contentHeight } : undefined"
          >
            <div ref="previewList" class="relative" data-slot="list">
              <ReuseContent />
            </div>
          </div>
        </CollapsibleContent>
        <p data-slot="trigger" class="mb-3 hidden min-h-7 items-center gap-1.5 text-sm text-heading font-semibold lg:flex">
          <ReuseTrigger :open="true" />
        </p>
        <div data-slot="content" class="relative hidden lg:block">
          <ReuseContent />
        </div>
      </template>
      <div v-if="slots.bottom" class="mt-6 hidden flex-col gap-6 lg:flex" data-slot="bottom">
        <slot name="bottom" :links="links" />
      </div>
    </div>
  </CollapsibleRoot>
</template>

<style scoped>
[data-layout='container'] { background: transparent; border: 0; backdrop-filter: none; }
[data-layout='container'] [data-slot='container'] { padding-block: 0; }
[data-layout='container'] button[data-slot='trigger'],
[data-layout='container'] .toc-content,
[data-layout='container'] [data-slot='content']:has(.toc-preview) { display: none; }
[data-layout='container'] p[data-slot='trigger'] { display: flex; }
[data-layout='container'] div[data-slot='content']:last-child { display: block; }
@container article-preview (max-width: 850px) {
  [data-layout='container'] button[data-slot='trigger'] { display: flex; }
  [data-layout='container'] button[data-slot='trigger'] :deep(.i-lucide-chevron-down) { display: inline-block; }
  [data-layout='container'] p[data-slot='trigger'],
  [data-layout='container'] div[data-slot='content']:last-child { display: none; }
  [data-layout='container'] .toc-content[data-state='open'],
  [data-layout='container'] [data-slot='content']:has(.toc-preview) { display: block; }
}
.toc-preview {
  transition: height 200ms ease-out;
}
.toc-content[data-state='open'] {
  animation: toc-expand 200ms ease-out;
}
.toc-content[data-state='closed'] {
  overflow: hidden;
  animation: toc-collapse 200ms ease-out;
}
@keyframes toc-expand {
  from { height: 0; }
  to { height: var(--reka-collapsible-content-height); }
}
@keyframes toc-collapse {
  from { height: var(--reka-collapsible-content-height); }
  to { height: 0; }
}
</style>
