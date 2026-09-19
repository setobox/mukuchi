<script setup lang="ts">
import type { IconCollection } from '#shared/cover/icons'
import type { IconChoice, IconSource } from '~/features/cover/catalog'
import type { CoverIcon } from '~/features/cover/model'
import { createIconCatalog, iconPageSize } from '~/features/cover/catalog'
import { svgDataUrl } from '~/features/cover/svg'

const props = defineProps<{ selected: string, color: string, disabled?: boolean }>()
const emit = defineEmits<{ select: [icon: CoverIcon] }>()
const catalog = createIconCatalog()
const source = ref<IconSource>('local')
const prefix = ref('lucide')
const query = ref('')
const page = ref(0)
const sets = shallowRef<IconCollection[]>([])
const choices = shallowRef<IconChoice[]>([])
const total = ref<number | null>(0)
const hasMore = ref(false)
const loading = ref(false)
const error = ref('')
const selectedInfo = ref('')
let request: AbortController | undefined
let disposed = false
const collection = computed(() => sets.value.find(set => set.prefix === prefix.value))
async function refresh() {
  if (disposed)
    return
  request?.abort()
  const current = new AbortController()
  request = current
  loading.value = true
  error.value = ''
  try {
    const collections = await catalog.collections(source.value, current.signal)
    const result = await catalog.search(source.value, prefix.value, query.value, page.value, current.signal)
    const icons = await catalog.icons(result.ids, current.signal)
    current.signal.throwIfAborted()
    sets.value = collections
    choices.value = icons
    total.value = result.total
    hasMore.value = result.hasMore
  }
  catch (cause) {
    if (!current.signal.aborted)
      error.value = cause instanceof Error ? cause.message : '图标库加载失败，请重试。'
  }
  finally {
    if (!current.signal.aborted)
      loading.value = false
  }
}
const searchLater = useDebounceFn(refresh, 200)
watch(source, () => {
  prefix.value = source.value === 'local' ? 'lucide' : ''
  query.value = ''
})
watch([source, prefix, query], () => {
  request?.abort()
  const qualified = /^([a-z0-9-]+):[a-z0-9-]+$/.exec(query.value.trim())
  if (qualified && qualified[1] !== prefix.value && sets.value.some(set => set.prefix === qualified[1])) {
    prefix.value = qualified[1]!
    return
  }
  choices.value = []
  page.value = 0
  loading.value = true
  searchLater()
})
function paginate(delta: number) {
  page.value += delta
  refresh()
}
function select(choice: IconChoice) {
  if (choice.icon && !props.disabled) {
    selectedInfo.value = ''
    emit('select', choice.icon)
  }
  else { selectedInfo.value = choice.error ?? '' }
}
onMounted(refresh)
onBeforeUnmount(() => {
  disposed = true
  request?.abort()
})
</script>

<template>
  <div class="min-w-0 space-y-3" aria-label="图标库">
    <div class="grid grid-cols-2 gap-2">
      <BaseSelect v-model="source" label="来源" :options="[{ value: 'local', label: '本地图标' }, { value: 'online', label: '在线图标' }]" :disabled="disabled" />
      <BaseSelect v-model="prefix" label="图标集" :options="[{ value: '', label: '全部图标集' }, ...sets.map(set => ({ value: set.prefix, label: `${set.name} · ${set.total}` }))]" :disabled="disabled" />
    </div>
    <label class="cover-field">搜索图标<input v-model="query" type="search" class="cover-input" placeholder="名称或 prefix:name" :disabled="disabled"></label>
    <div class="flex items-center justify-between gap-2 text-xs text-muted">
      <span>{{ loading ? '正在加载…' : total === null ? '搜索结果' : `${total} 个图标` }}</span>
      <a v-if="collection?.license?.url" :href="collection.license.url" target="_blank" rel="noreferrer" class="text-link">{{ collection.license.name }}</a>
      <span v-else>{{ collection?.license?.name }}</span>
    </div>
    <div v-if="error" role="alert" class="text-sm text-error">
      {{ error }}<button type="button" class="control-base ml-2 text-error underline-offset-4 active:underline hover:underline" @click="catalog.clear(); refresh()">
        重试
      </button>
    </div>
    <p v-else-if="!loading && !choices.length" class="py-3 text-xs text-muted">
      {{ source === 'online' && !prefix && !query ? '选择图标集或输入名称搜索在线图标。' : '没有匹配的图标。' }}
    </p>
    <div v-if="choices.length" class="grid grid-cols-6 max-h-72 gap-1 overflow-y-auto p-1" :aria-busy="loading">
      <button v-for="choice in choices" :key="choice.id" type="button" :disabled="disabled || loading" :title="choice.error ? `${choice.id}：${choice.error}` : choice.id" :aria-label="choice.id" :aria-pressed="selected === choice.id" class="control-base control-quiet min-w-0 border p-2" :class="selected === choice.id ? 'control-selected border-accent' : 'border-transparent'" @click="select(choice)">
        <img v-if="choice.icon" :src="svgDataUrl(choice.icon.svg.replaceAll('currentColor', color))" alt="" class="size-6 object-contain">
        <span v-else class="text-xs text-muted">不可用</span>
      </button>
    </div>
    <p v-if="selectedInfo" role="status" class="text-xs text-warn">
      {{ selectedInfo }}
    </p>
    <div v-if="choices.length || page" class="flex items-center justify-between text-xs">
      <button type="button" class="control-base control-quiet px-2" :disabled="loading || !page" @click="paginate(-1)">
        上一页
      </button>
      <span class="text-muted">第 {{ page + 1 }} 页<span v-if="total !== null"> / 共 {{ Math.max(1, Math.ceil(total / iconPageSize)) }} 页</span></span>
      <button type="button" class="control-base control-quiet px-2" :disabled="loading || !hasMore" @click="paginate(1)">
        下一页
      </button>
    </div>
  </div>
</template>
