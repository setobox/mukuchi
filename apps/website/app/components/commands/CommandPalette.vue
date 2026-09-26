<script setup lang="ts">
import type { Command } from '~/features/commands/controller'
import { acceptsPaletteShortcut, groupCommands, nextSelection, paletteInputAction } from '~/features/commands/controller'
import { navigateFromPalette } from '~/features/commands/navigation'
import { createSearchLoader } from '~/features/search/loader'
import { searchArticles } from '~/features/search/model'

const { site } = useAppConfig()
const { destinations } = useSiteNavigation()
const palette = useCommandPalette()
const { query, inputQuery, mode, commands, commandQuery, isOpen } = palette
const dialogOpen = computed({
  get: () => isOpen.value,
  set: (value) => {
    if (!value)
      palette.close()
  },
})
const route = useRoute()
const router = useRouter()
const nuxtApp = useNuxtApp()
const theme = useSiteTheme()
const scroll = useScrollToTop()
const input = useTemplateRef<HTMLInputElement>('input')
const inputId = useId()
const listId = useId()
const selected = ref(-1)
const composing = ref(false)
const executionError = ref('')
const executing = ref(false)
const modeMenuOpen = ref(false)
const commandGroups = computed(() => groupCommands(commands.value.map((command, index) => ({ ...command, index }))))
let afterClose: (() => void | Promise<void>) | undefined
let disposed = false

const loader = createSearchLoader(async () => queryCollectionSearchSections('posts', {
  ignoredTags: ['script', 'style'],
  minHeading: 'h1',
  maxHeading: 'h6',
  extraFields: ['path', 'description', 'tags', 'categories', 'pin', 'publish'],
}))
const { status, documents } = loader
const matches = computed(() => searchArticles(documents.value, mode.value === 'search' ? query.value : ''))
const available = computed(() => mode.value === 'commands' ? commands.value.map(command => command.available) : matches.value.results.map(() => true))
const activeId = computed(() => selected.value >= 0 ? `${listId}-${selected.value}` : undefined)
const message = computed(() => {
  if (mode.value === 'commands')
    return commands.value.length ? '' : '没有匹配的命令，请修改关键词。'
  if (status.value === 'loading')
    return '正在加载文章索引…'
  if (status.value === 'error')
    return '文章索引加载失败，请重试。'
  if (status.value === 'ready' && !documents.value.length)
    return '暂无可搜索的文章。'
  if (!query.value.trim())
    return '输入关键词搜索文章'
  if (!matches.value.total)
    return '没有匹配的文章，请减少或更换关键词。'
  return matches.value.total > 20 ? `找到 ${matches.value.total} 篇文章，仅显示前 20 篇，请缩小关键词范围。` : `找到 ${matches.value.total} 篇文章`
})

function focusInput() {
  input.value?.focus({ preventScroll: true })
}

watch(() => palette.focusVersion.value, async () => {
  afterClose = undefined
  executionError.value = ''
  composing.value = false
  await nextTick()
  focusInput()
})
watch([isOpen, mode], ([open, current]) => {
  if (open && current === 'search')
    void loader.load()
})
watch([query, available], () => {
  selected.value = nextSelection(-1, 1, available.value)
}, { immediate: true })
watch(selected, async () => {
  await nextTick()
  if (activeId.value)
    document.getElementById(activeId.value)?.scrollIntoView({ block: 'nearest' })
})
watch(() => route.fullPath, palette.close)
watch(() => [site.features.search, site.features.commands], () => {
  if (!site.features.search && !site.features.commands)
    palette.close()
})

function register(command: Command) {
  const unregister = palette.register(command)
  onScopeDispose(unregister)
}
register({ id: 'search', label: '搜索文章', keywords: ['search', '文章'], icon: 'search', category: '搜索', visible: () => site.features.search, keepOpen: true, execute: () => palette.open('search') })
useNavigationCommands(destinations, palette.register, navigate)
for (const option of [
  { preference: 'light', label: '浅色主题', icon: 'sun' },
  { preference: 'dark', label: '深色主题', icon: 'moon' },
  { preference: 'system', label: '跟随系统', icon: 'monitor' },
] as const) {
  register({
    id: `theme:${option.preference}`,
    label: option.label,
    keywords: ['主题', 'theme', option.preference],
    icon: option.icon,
    category: '主题',
    available: () => !theme.unknown.value && !theme.isTransitioning.value && theme.preference.value !== option.preference,
    status: () => theme.preference.value === option.preference ? '当前设置' : theme.isTransitioning.value ? '切换中' : '',
    execute: () => theme.setPreference(option.preference),
  })
}
register({ id: 'scroll:top', label: '回到顶部', keywords: ['top', '滚动'], icon: 'up', category: '滚动', available: scroll.isScrolled, status: () => scroll.isScrolled.value ? '' : '已在顶部', execute: scroll.scrollToTop })

async function navigate(target: string) {
  await navigateFromPalette(target, {
    current: () => router.currentRoute.value,
    resolve: destination => router.resolve(destination),
    push: async (destination) => {
      const failure = await router.push(destination)
      return !failure || router.currentRoute.value.fullPath === router.resolve(destination).fullPath
    },
    onPageReady: callback => nuxtApp.hook('page:loading:end', callback),
    afterLayout: async () => {
      await nextTick()
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    },
    scroll: ({ hash }) => {
      const element = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null
      if (element)
        element.scrollIntoView({ block: 'start', behavior: 'instant' })
      else
        window.scrollTo({ top: 0, behavior: 'instant' })
    },
  })
}

async function run(action: () => void | Promise<void>) {
  executing.value = true
  try {
    await action()
  }
  catch (error) {
    if (!disposed) {
      palette.open(mode.value)
      // The open watcher clears old errors before this next tick.
      await nextTick()
      executionError.value = '操作失败，请重试。'
      console.error('命令面板操作失败', error)
    }
  }
  finally {
    executing.value = false
  }
}

function activate(index: number) {
  if (composing.value || executing.value || !available.value[index])
    return
  executionError.value = ''
  if (mode.value === 'commands') {
    const command = commands.value[index]
    if (!command)
      return
    if (command.keepOpen) {
      void run(command.execute)
      return
    }
    afterClose = command.execute
  }
  else {
    const result = matches.value.results[index]
    if (!result)
      return
    afterClose = () => navigate(result.id)
  }
  palette.close()
}

function closed() {
  const action = afterClose
  afterClose = undefined
  if (action && !disposed)
    void run(action)
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Backspace' && !event.isComposing && !composing.value && event.keyCode !== 229 && mode.value === 'commands' && !inputQuery.value && site.features.search) {
    event.preventDefault()
    palette.open('search')
    return
  }
  const action = paletteInputAction(event, composing.value)
  if (!action)
    return
  event.preventDefault()
  if (action === 'execute') {
    activate(selected.value)
  }
  else {
    selected.value = nextSelection(selected.value, action === 'next' ? 1 : -1, available.value)
  }
}

onMounted(() => {
  useEventListener(document, 'keydown', (event) => {
    const target = event.target instanceof Element ? event.target : null
    const editable = Boolean(target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))
    const ownDialog = input.value?.closest('dialog')
    const otherDialog = [...document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')].some(dialog => dialog !== ownDialog)
    if (!acceptsPaletteShortcut(event, { enabled: site.features.search || site.features.commands, open: isOpen.value, editable, otherDialog }) || composing.value)
      return
    event.preventDefault()
    if (isOpen.value)
      focusInput()
    else
      palette.open(site.features.search ? 'search' : 'commands')
  })
})
onScopeDispose(() => {
  disposed = true
  afterClose = undefined
  loader.reset()
})
</script>

<template>
  <AcrylicDialog v-model="dialogOpen" :title="mode === 'search' ? '站内搜索' : '命令面板'" placement="commands" @opened="focusInput" @closed="closed">
    <label :for="inputId" class="sr-only">{{ mode === 'search' ? '文章关键词' : '命令关键词' }}</label>
    <div class="field-group relative z-1 flex shrink-0 items-center gap-2 border border-line-strong rounded-button bg-canvas pl-1 pr-3">
      <PaletteModeMenu :mode="mode" :features="site.features" :active="isOpen" @select="palette.open" @open-change="modeMenuOpen = $event" />
      <input
        :id="inputId" ref="input" v-model="inputQuery" autofocus type="text" autocomplete="off" autocapitalize="off" :spellcheck="false"
        class="min-h-11 min-w-0 w-full border-0 rounded-button bg-transparent py-2 text-[16px] leading-6"
        :placeholder="mode === 'search' ? '输入关键词搜索文章' : '输入命令名称'"
        role="combobox" aria-autocomplete="list" :aria-expanded="isOpen" :aria-controls="listId" :aria-activedescendant="activeId"
        @keydown="onInputKeydown" @compositionstart="composing = true" @compositionend="composing = false"
      >
    </div>
    <p v-if="message" class="shrink-0 py-2 text-[16px] text-muted leading-6" role="status" aria-live="polite">
      {{ message }}
    </p>
    <p v-if="executionError" class="shrink-0 pb-3 text-[16px] text-heading leading-6" role="alert">
      {{ executionError }}
    </p>
    <BaseButton v-if="mode === 'search' && status === 'error'" class="mb-3 self-start" variant="border" @click="loader.load()">
      重新加载
    </BaseButton>
    <div :id="listId" role="listbox" :aria-label="mode === 'search' ? '文章搜索结果' : '可用命令'" :aria-busy="mode === 'search' && status === 'loading'" class="[scrollbar-gutter:stable] overflow-y-auto overscroll-contain pb-1" :class="[modeMenuOpen ? 'min-h-26' : 'min-h-0', !message ? 'mt-3' : '']">
      <template v-if="mode === 'search'">
        <div
          v-for="(result, index) in matches.results" :id="`${listId}-${index}`" :key="result.id"
          role="option" :aria-selected="selected === index"
          class="control-quiet mb-1 cursor-pointer px-3 py-2 text-[16px] leading-6"
          :class="selected === index ? 'control-selected ring-1 ring-inset ring-accent-soft' : ''"
          @pointermove="selected = index" @mousedown.prevent @click="activate(index)"
        >
          <p class="flex items-start gap-2 text-heading font-semibold">
            <AppIcon name="notebook" class="mt-[3px]" />
            <span class="min-w-0 break-words"><SearchHighlight :text="result.title" :query="query" /></span>
          </p>
          <p v-if="result.section" class="mt-1 break-words text-accent-soft">
            <SearchHighlight :text="result.section" :query="query" />
          </p>
          <p v-if="result.excerpt" class="line-clamp-3 mt-1 break-words text-muted">
            <SearchHighlight :text="result.excerpt" :query="query" />
          </p>
        </div>
      </template>
      <template v-else>
        <div v-for="(group, groupIndex) in commandGroups" :key="group.category" role="group" :aria-label="group.category" :class="groupIndex ? 'mt-2 border-t border-line-strong pt-2' : ''">
          <div
            v-for="command in group.items" :id="`${listId}-${command.index}`" :key="command.id"
            role="option" :aria-selected="selected === command.index" :aria-disabled="!command.available"
            class="control-quiet mb-0.5 min-h-11 flex items-center justify-between gap-3 px-3 py-1.5 text-[16px] leading-6"
            :class="[command.available ? 'cursor-pointer' : 'text-muted', selected === command.index ? 'control-selected ring-1 ring-inset ring-accent-soft' : '']"
            @pointermove="command.available && (selected = command.index)" @mousedown.prevent @click="activate(command.index)"
          >
            <span class="min-w-0 flex items-center gap-3">
              <AppIcon :name="command.icon" />
              <span class="min-w-0 break-words"><SearchHighlight :text="command.label" :query="commandQuery" /></span>
            </span>
            <span class="flex shrink-0 items-center gap-3 whitespace-nowrap text-muted">
              <span v-if="command.status">{{ command.status }}</span>
              <span class="rounded-md bg-line px-2 py-0.5">{{ command.category ?? '操作' }}</span>
            </span>
          </div>
        </div>
      </template>
    </div>
    <div class="mt-3 hidden shrink-0 flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[16px] text-muted leading-6 md:flex" aria-hidden="true">
      <span>↑ ↓ 选择</span><span>Enter 确认</span><span>Esc 关闭</span>
    </div>
  </AcrylicDialog>
</template>
