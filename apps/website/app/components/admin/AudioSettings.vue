<script setup lang="ts">
import type { AiStatus } from '#shared/admin/articles'
import type { AudioJobView, AudioKind, AudioSettingsView } from '#shared/audio/model'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { aiStatusLabels, aiStatusTone } from '#shared/admin/articles'
import { articleRoute } from '#shared/admin/model'
import { audioStatusLabel, defaultAudioSettings, kindEnabled } from '#shared/audio/model'
import { acceptAudioSettings, audioSettingsForKind } from '#shared/audio/settings-form'

const props = defineProps<{ kind: AudioKind, active: boolean }>()
const { current, request, endpoint } = useAdminSession()
const { notify } = useAdminFeedback()
const route = useRoute()
const form = ref<AudioSettingsView>({ ...defaultAudioSettings, version: 0, keyConfigured: false, encryptionReady: false, executionReady: false })
const savedForm = ref<AudioSettingsView>({ ...form.value })
const key = ref('')
const clearKey = ref(false)
const loaded = ref(false)
const settingsLoading = ref(false)
const savingSettings = ref(false)
const settingsError = ref('')
const loading = ref(false)
const listLoaded = ref(false)
const error = ref('')
const selected = ref<Record<AudioKind, string[]>>({ narration: [], podcast: [] })
const query = ref('')
const filter = ref('all')
const page = ref(1)
const enqueueing = ref<string[]>([])
const changing = ref<string[]>([])
const preview = ref<AudioJobView | null>(null)
const acknowledgeCost = ref<string[]>([])
const visibility = useDocumentVisibility()
interface AudioListArticle { path: string, title: string, narrationEnabled: boolean, podcastEnabled: boolean }
const list = ref<{ jobs: AudioJobView[], articles: AudioListArticle[], usage: { day: string, narrationCharacters: number, podcasts: number } }>({ jobs: [], articles: [], usage: { day: '', narrationCharacters: 0, podcasts: 0 } })
let sequence = 0
const label = computed(() => props.kind === 'narration' ? 'AI 朗读' : '双人播客')
const enabled = computed({ get: () => form.value[props.kind === 'narration' ? 'narrationEnabled' : 'podcastEnabled'], set: (value) => {
  form.value[props.kind === 'narration' ? 'narrationEnabled' : 'podcastEnabled'] = value
} })
const quota = computed({ get: () => form.value[props.kind === 'narration' ? 'dailyNarrationCharacters' : 'dailyPodcasts'], set: (value) => {
  form.value[props.kind === 'narration' ? 'dailyNarrationCharacters' : 'dailyPodcasts'] = value
} })
type TextField = 'narrationResource' | 'narrationSpeaker' | 'podcastResource' | 'podcastSpeaker1' | 'podcastSpeaker2'
const fields = computed<{ key: TextField, label: string }[]>(() => props.kind === 'narration'
  ? [{ key: 'narrationResource', label: '资源 ID' }, { key: 'narrationSpeaker', label: '朗读音色 ID' }]
  : [{ key: 'podcastResource', label: '资源 ID' }, { key: 'podcastSpeaker1', label: '第一位主播音色 ID' }, { key: 'podcastSpeaker2', label: '第二位主播音色 ID' }])
function jobsFor(path: string) {
  return list.value.jobs.filter(job => job.path === path && job.kind === props.kind).sort((a, b) => Number(b.current) - Number(a.current) || b.createdAt.localeCompare(a.createdAt))
}
function state(article: AudioListArticle): AiStatus {
  if (!kindEnabled(savedForm.value, props.kind) || !article[props.kind === 'narration' ? 'narrationEnabled' : 'podcastEnabled'])
    return 'disabled'
  const jobs = jobsFor(article.path)
  const job = jobs.find(job => job.current)
  return job ? job.status === 'succeeded' ? job.publication : job.status : jobs.length ? 'stale' : 'missing'
}
const rows = computed(() => list.value.articles.filter(article => (`${article.title} ${article.path}`).toLowerCase().includes(query.value.trim().toLowerCase()) && (filter.value === 'all' || state(article) === filter.value)))
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 20)))
const visible = computed(() => rows.value.slice((page.value - 1) * 20, page.value * 20))
watch(() => route.query.article, (value) => {
  query.value = typeof value === 'string' ? articleRoute(value) : ''
}, { immediate: true })
watch([query, filter, () => props.kind], () => {
  page.value = 1
  preview.value = null
})
watch(pages, (value) => {
  page.value = Math.min(page.value, value)
})
async function loadJobs() {
  if (!current.value.user?.owner)
    return
  const token = ++sequence
  loading.value = true
  try {
    const result = await request<typeof list.value>('audio/jobs')
    if (token === sequence) {
      list.value = result
      listLoaded.value = true
      error.value = ''
    }
  }
  catch (cause) {
    if (token === sequence)
      error.value = adminError(cause)
  }
  finally {
    if (token === sequence)
      loading.value = false
  }
}
async function load() {
  if (!current.value.user?.owner || settingsLoading.value)
    return
  settingsLoading.value = true
  settingsError.value = ''
  try {
    form.value = await request('audio/settings')
    savedForm.value = { ...form.value }
    loaded.value = true
  }
  catch (cause) { settingsError.value = adminError(cause) }
  finally { settingsLoading.value = false }
}
watch(() => current.value.user?.owner, () => {
  void load()
  void loadJobs()
}, { immediate: true })
async function save() {
  if (savingSettings.value)
    return
  const kind = props.kind
  savingSettings.value = true
  settingsError.value = ''
  try {
    const settings = audioSettingsForKind(savedForm.value, form.value, kind)
    const result = await request<AudioSettingsView>('audio/settings', { method: 'PUT', body: { ...settings, version: savedForm.value.version, apiKey: key.value || undefined, clearKey: clearKey.value } })
    form.value = acceptAudioSettings(form.value, result, kind)
    savedForm.value = result
    key.value = ''
    clearKey.value = false
    notify(`${kind === 'narration' ? '朗读' : '播客'}设置和共用语音设置已保存。`)
    await loadJobs()
  }
  catch (cause) { settingsError.value = adminError(cause) }
  finally { savingSettings.value = false }
}
async function enqueue(paths: string[]) {
  if (enqueueing.value.length || !paths.length || paths.length > 50)
    return
  const kind = props.kind
  enqueueing.value = [...paths]
  error.value = ''
  try {
    const result = await request<{ message: string }>('audio/jobs', { method: 'POST', body: { paths, kinds: [kind] } })
    selected.value[kind] = []
    notify(result.message)
    await loadJobs()
  }
  catch (cause) { error.value = adminError(cause) }
  finally { enqueueing.value = [] }
}
async function change(job: AudioJobView, operation: 'publish' | 'hide' | 'retry' | 'resume') {
  if (changing.value.includes(job.id))
    return
  changing.value.push(job.id)
  error.value = ''
  try {
    await request(`audio/jobs/${job.id}`, { method: 'POST', body: { action: operation, version: job.version, acknowledgeCost: acknowledgeCost.value.includes(job.id) } })
    acknowledgeCost.value = acknowledgeCost.value.filter(id => id !== job.id)
    notify(operation === 'publish' ? '音频已公开。' : operation === 'hide' ? '音频已隐藏。' : '任务已重新加入队列。')
    await loadJobs()
  }
  catch (cause) { error.value = adminError(cause) }
  finally { changing.value = changing.value.filter(id => id !== job.id) }
}
useIntervalFn(() => {
  if (props.active && loaded.value && !loading.value && visibility.value === 'visible' && list.value.jobs.some(job => job.status === 'queued' || job.status === 'running'))
    void loadJobs()
}, 10_000)
</script>

<template>
  <section :aria-label="`${label}设置与管理`">
    <h2 class="mb-4 text-title text-heading font-semibold">
      {{ label }}设置
    </h2>
    <p class="mb-5 text-sm text-muted">
      {{ kind === 'narration' ? '文章上线及正文更新后自动生成，生成完成后公开。' : '文章上线及正文更新后自动生成，生成完成后需要试听并确认公开。' }}
    </p>
    <p v-if="settingsError" role="alert" class="mb-4 text-error">
      {{ settingsError }}
    </p>
    <AdminSkeleton v-if="settingsLoading && !loaded" />
    <BaseButton v-if="!loaded && settingsError" variant="border" @click="load">
      重试设置查询
    </BaseButton>
    <form v-if="loaded" class="max-w-4xl" @submit.prevent="save">
      <fieldset :disabled="savingSettings" class="space-y-5">
        <details class="border border-line rounded-panel p-5" :open="!form.keyConfigured">
          <summary class="control-base cursor-pointer text-heading">
            共用语音服务 <span class="ml-2 text-xs text-muted">朗读与播客共用凭据和总开关</span>
          </summary>
          <div class="mt-5 space-y-5">
            <BaseSwitch v-model="form.enabled" label="启用音频自动生成" />
            <BaseSelect v-model="form.authMode" label="火山语音鉴权" :options="[{ value: 'apiKey', label: '新版 API Key' }, { value: 'legacy', label: '旧版 App ID + Access Token' }]" />
            <label v-if="form.authMode === 'legacy'" class="block text-sm text-muted">App ID<input v-model="form.appId" class="field-control mt-2 w-full px-3" autocomplete="off"></label>
            <label class="block text-sm text-muted">{{ form.authMode === 'apiKey' ? '语音 API Key' : '语音 Access Token' }}<input v-model="key" type="password" class="field-control mt-2 w-full px-3" autocomplete="new-password" :disabled="!form.encryptionReady" :placeholder="form.keyConfigured ? '已配置；留空保留密钥' : '请输入火山语音凭据'"></label>
            <p v-if="!form.encryptionReady" class="text-xs text-warn">
              服务端加密密钥尚未配置，暂不能保存语音凭据。
            </p>
            <label v-if="form.keyConfigured" class="min-h-11 flex items-center gap-3 text-sm text-error"><input v-model="clearKey" type="checkbox" class="accent-error">删除已保存的语音密钥</label>
            <p class="text-xs text-muted">
              启用总开关前，请分别保存所需的朗读、播客配置。不使用的类型可在对应页关闭。
            </p>
          </div>
        </details>
        <div class="border border-line rounded-panel p-5 space-y-5">
          <BaseSwitch v-model="enabled" :label="`启用${label}`" />
          <div class="grid gap-5 md:grid-cols-2">
            <label v-for="field in fields" :key="field.key" class="block text-sm text-muted">{{ field.label }}<input v-model="form[field.key]" class="field-control mt-2 w-full px-3"></label>
            <label class="block text-sm text-muted">{{ kind === 'narration' ? '每日朗读字符额度' : '每日播客任务数' }}<input v-model.number="quota" type="number" min="0" :max="kind === 'narration' ? 10000000 : 1000" step="1" class="field-control mt-2 w-full px-3"></label>
          </div>
        </div>
        <p v-if="!form.executionReady" class="text-xs text-warn">
          当前环境暂不执行音频生成。配置可以保存，生成需要已启用的音频执行环境。
        </p>
        <p class="text-xs text-muted">
          额度按北京时间重置，超额任务继续排队；重试也会预占额度。更换音色后需要为文章生成新版本。保存只提交当前类型和共用设置。
        </p>
        <BaseButton type="submit" :loading="savingSettings">
          保存{{ label }}设置
        </BaseButton>
      </fieldset>
    </form>
    <section class="mt-10 border-t border-line pt-8" :aria-label="`${label}文章列表`">
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <h2 class="mr-auto text-section text-heading">
          {{ label }}管理
        </h2><BaseButton variant="border" :loading="loading" @click="loadJobs">
          刷新任务
        </BaseButton>
      </div>
      <p class="mb-5 text-xs text-muted">
        今日已预占 {{ kind === 'narration' ? `${list.usage.narrationCharacters} 字朗读` : `${list.usage.podcasts} 个播客任务` }}。仅为已上线文章生成，重复内容会复用已有任务。
      </p>
      <p v-if="error" role="alert" class="mb-4 text-error">
        {{ error }}
      </p>
      <div class="mb-4 flex flex-wrap gap-3">
        <input v-model="query" aria-label="搜索音频文章" placeholder="搜索文章标题或公开路径" class="field-control min-w-0 flex-1 px-3">
        <BaseSelect v-model="filter" aria-label="音频状态" :options="[{ value: 'all', label: '全部状态' }, ...Object.entries(aiStatusLabels).filter(([value]) => value !== 'valid').map(([value, label]) => ({ value, label }))]" class="w-40" />
      </div>
      <div class="mb-5 flex flex-wrap gap-3">
        <BaseButton variant="border" :disabled="!!enqueueing.length" @click="selected[kind] = visible.filter(article => state(article) !== 'disabled').map(article => article.path)">
          选择本页
        </BaseButton>
        <BaseButton variant="ghost" :disabled="!!enqueueing.length || !selected[kind].length" @click="selected[kind] = []">
          清空选择
        </BaseButton>
        <BaseButton :loading="!!enqueueing.length" :disabled="!selected[kind].length || selected[kind].length > 50 || !kindEnabled(savedForm, kind) || !savedForm.executionReady" @click="enqueue(selected[kind])">
          生成所选（{{ selected[kind].length }} / 50）
        </BaseButton>
      </div>
      <AdminSkeleton v-if="loading && !listLoaded" />
      <div v-else class="overflow-hidden border border-line rounded-panel">
        <article v-for="article in visible" :key="article.path" class="border-b border-line p-4 last:border-b-0">
          <div class="flex flex-wrap items-center gap-3">
            <label class="min-h-11 flex items-center"><input v-model="selected[kind]" type="checkbox" :value="article.path" :aria-label="`选择 ${article.title}`" :disabled="!!enqueueing.length || state(article) === 'disabled' || (selected[kind].length >= 50 && !selected[kind].includes(article.path))" class="accent-accent"></label>
            <div class="min-w-0 flex-1">
              <p class="break-words text-heading">
                {{ article.title }}
              </p><p class="mt-1 break-all text-xs text-muted">
                {{ article.path }}
              </p>
            </div>
            <BaseTag :tone="aiStatusTone(state(article))" class="text-xs">
              {{ aiStatusLabels[state(article)] }}
            </BaseTag>
            <BaseButton variant="border" :loading="enqueueing.includes(article.path)" :disabled="!!enqueueing.length || state(article) === 'disabled' || !savedForm.executionReady" @click="enqueue([article.path])">
              生成 / 补齐
            </BaseButton>
          </div>
          <div v-for="job in jobsFor(article.path).slice(0, 1)" :key="job.id" class="mt-3 border-t border-line pt-3">
            <p class="text-xs text-muted">
              {{ audioStatusLabel(job) }}{{ job.current ? '' : ' · 旧版本' }} · {{ new Date(job.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }}
            </p>
            <p v-if="job.message" class="mt-2 break-words text-xs" :class="job.status === 'failed' || job.status === 'unknown' ? 'text-error' : 'text-muted'">
              {{ job.message }}
            </p>
            <p v-if="job.providerId && (job.status === 'failed' || job.status === 'unknown')" class="mt-2 break-all text-xs text-muted">
              原任务 ID：{{ job.providerId }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <BaseButton v-if="job.status === 'succeeded'" variant="border" @click="preview = preview?.id === job.id ? null : job">
                {{ preview?.id === job.id ? '关闭试听' : '试听' }}
              </BaseButton>
              <BaseButton v-if="job.status === 'succeeded' && job.publication !== 'public'" :loading="changing.includes(job.id)" :disabled="!job.current" @click="change(job, 'publish')">
                确认并公开
              </BaseButton>
              <BaseButton v-if="job.publication === 'public'" variant="border" :loading="changing.includes(job.id)" @click="change(job, 'hide')">
                隐藏音频
              </BaseButton>
              <BaseButton v-if="job.resumable" variant="border" :disabled="!job.current" :loading="changing.includes(job.id)" @click="change(job, 'resume')">
                恢复原任务
              </BaseButton>
              <BaseButton v-if="job.status === 'failed' || job.status === 'unknown'" variant="border" :loading="changing.includes(job.id)" :disabled="!job.current || (job.status === 'unknown' && !acknowledgeCost.includes(job.id))" @click="change(job, 'retry')">
                重新生成
              </BaseButton>
            </div>
            <label v-if="job.status === 'unknown'" class="mt-3 min-h-11 flex items-center gap-3 text-xs text-warn"><input v-model="acknowledgeCost" type="checkbox" :value="job.id" class="accent-accent">我已检查原任务，了解重新生成可能再次计费。</label>
          </div>
          <details v-if="jobsFor(article.path).length > 1" class="mt-3">
            <summary class="control-base cursor-pointer text-xs text-muted">
              历史任务（{{ jobsFor(article.path).length - 1 }}）
            </summary>
            <div v-for="job in jobsFor(article.path).slice(1)" :key="job.id" class="flex flex-wrap items-center gap-3 border-t border-line py-2 text-xs">
              <span>{{ audioStatusLabel(job) }} · {{ new Date(job.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) }}</span>
              <BaseButton v-if="job.status === 'succeeded'" variant="ghost" @click="preview = job">
                试听旧版本
              </BaseButton>
              <BaseButton v-if="job.publication === 'public'" variant="ghost" :loading="changing.includes(job.id)" @click="change(job, 'hide')">
                隐藏旧版本
              </BaseButton>
            </div>
          </details>
          <ClientOnly><AudioPlayer v-if="preview?.path === article.path && preview.kind === kind" :key="preview.id" class="mt-4" :items="[{ id: preview.id, kind: preview.kind, url: endpoint(`/api/admin/audio/jobs/${preview.id}/file`) }]" preview /></ClientOnly>
        </article>
        <p v-if="!visible.length" class="p-8 text-center text-muted">
          {{ query || filter !== 'all' ? '没有匹配的已上线文章。' : '暂无已上线文章，发布并完成部署后可在此生成音频。' }}
        </p>
      </div>
      <div class="mt-4 flex flex-wrap items-center justify-end gap-3 text-xs text-muted">
        <span class="mr-auto">共 {{ rows.length }} 篇</span><BaseButton variant="border" :disabled="page <= 1" @click="page--">
          上一页
        </BaseButton><span>{{ page }} / {{ pages }}</span><BaseButton variant="border" :disabled="page >= pages" @click="page++">
          下一页
        </BaseButton>
      </div>
    </section>
  </section>
</template>
