<script setup lang="ts">
import type { AudioJobView, AudioKind, AudioSettingsView } from '#shared/audio/model'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { audioSettingsSchema, audioStatusLabel, defaultAudioSettings } from '#shared/audio/model'

const { current, request, endpoint } = useAdminSession()
const form = ref<AudioSettingsView>({ ...defaultAudioSettings, version: 0, keyConfigured: false, encryptionReady: false, executionReady: false })
const key = ref('')
const clearKey = ref(false)
const busy = ref(false)
const loaded = ref(false)
const error = ref('')
const message = ref('')
const selected = ref<string[]>([])
const kinds = ref<AudioKind[]>(['narration', 'podcast'])
const preview = ref<AudioJobView | null>(null)
const acknowledgeCost = ref(false)
const visibility = useDocumentVisibility()
const list = ref<{ jobs: AudioJobView[], articles: { path: string, title: string }[], usage: { day: string, narrationCharacters: number, podcasts: number } }>({ jobs: [], articles: [], usage: { day: '', narrationCharacters: 0, podcasts: 0 } })
async function loadJobs() {
  list.value = await request('audio/jobs')
}
async function load() {
  if (!current.value.user?.owner || loaded.value)
    return
  try {
    form.value = await request('audio/settings')
    await loadJobs()
    loaded.value = true
  }
  catch (cause) {
    error.value = adminError(cause)
  }
}
watch(() => current.value.user?.owner, load, { immediate: true })
async function action(callback: () => Promise<string>) {
  busy.value = true
  error.value = message.value = ''
  try {
    message.value = await callback()
    await loadJobs()
  }
  catch (cause) {
    error.value = adminError(cause)
  }
  finally {
    busy.value = false
  }
}
function save() {
  return action(async () => {
    const settings = Object.fromEntries(Object.keys(audioSettingsSchema.shape).map(name => [name, form.value[name as keyof AudioSettingsView]]))
    form.value = await request('audio/settings', { method: 'PUT', body: { ...settings, version: form.value.version, apiKey: key.value || undefined, clearKey: clearKey.value } })
    key.value = ''
    clearKey.value = false
    return form.value.enabled ? '设置已保存。启用时保留历史文章，后续发布和正文更新将自动生成。' : '设置已保存，音频生成已关闭。'
  })
}
function enqueue() {
  return action(async () => {
    const result = await request<{ message: string }>('audio/jobs', { method: 'POST', body: { paths: selected.value, kinds: kinds.value } })
    selected.value = []
    return result.message
  })
}
function change(job: AudioJobView, operation: 'publish' | 'hide' | 'retry' | 'resume') {
  return action(async () => {
    await request(`audio/jobs/${job.id}`, { method: 'POST', body: { action: operation, version: job.version, acknowledgeCost: acknowledgeCost.value } })
    acknowledgeCost.value = false
    return operation === 'publish' ? '音频已公开。' : operation === 'hide' ? '音频已隐藏。' : '任务已重新加入队列。'
  })
}
useIntervalFn(async () => {
  if (!loaded.value || busy.value || visibility.value === 'hidden' || !list.value.jobs.some(job => job.status === 'running' || job.status === 'queued'))
    return
  try {
    await loadJobs()
  }
  catch { /* Manual refresh remains available without interrupting form edits. */ }
}, 10_000)
</script>

<template>
  <section class="mt-12 border-t border-line pt-8" aria-labelledby="audio-settings-title">
    <h2 id="audio-settings-title" class="mb-4 text-section text-heading font-semibold">
      AI 朗读与双人播客
    </h2>
    <p class="mb-6 text-sm text-muted leading-7">
      新文章上线及正文更新后自动生成；朗读完成后公开，双人播客需要试听确认。读者播放已有音频，不会触发生成。
    </p>
    <p v-if="error" role="alert" class="mb-4 text-error">
      {{ error }}
    </p>
    <p v-if="message" role="status" class="mb-4 text-muted">
      {{ message }}
    </p>
    <form v-if="loaded" @submit.prevent="save">
      <fieldset :disabled="busy" class="space-y-5">
        <BaseSwitch v-model="form.enabled" label="启用音频自动生成" />
        <p v-if="!form.executionReady" class="text-xs text-warn leading-6">
          音频执行环境尚未启用。请先按部署说明配置 Workflows、私有 R2 桶和服务端开关；普通本地开发不会调用火山。
        </p>
        <BaseSelect v-model="form.authMode" label="火山语音鉴权" :options="[{ value: 'apiKey', label: '新版 API Key' }, { value: 'legacy', label: '旧版 App ID + Access Token' }]" />
        <label v-if="form.authMode === 'legacy'" class="block text-sm text-muted">App ID<input v-model="form.appId" class="field-control mt-2 w-full px-3" autocomplete="off"></label>
        <label class="block text-sm text-muted">{{ form.authMode === 'apiKey' ? '语音 API Key' : '语音 Access Token' }}<input v-model="key" type="password" class="field-control mt-2 w-full px-3" autocomplete="new-password" :disabled="!form.encryptionReady" :placeholder="form.keyConfigured ? '已配置；留空保留密钥' : '请输入火山语音凭据'"></label>
        <label v-if="form.keyConfigured" class="min-h-11 flex items-center gap-3 text-sm text-error has-[:disabled]:pointer-events-none has-[:disabled]:opacity-45"><input v-model="clearKey" type="checkbox" class="accent-error">删除已保存的语音密钥</label>
        <div class="grid gap-5 md:grid-cols-2">
          <section class="border border-line rounded-panel p-4 space-y-4" aria-label="朗读设置">
            <BaseSwitch v-model="form.narrationEnabled" label="全文朗读" />
            <label class="block text-sm text-muted">资源 ID<input v-model="form.narrationResource" class="field-control mt-2 w-full px-3"></label>
            <label class="block text-sm text-muted">朗读音色 ID<input v-model="form.narrationSpeaker" class="field-control mt-2 w-full px-3" placeholder="zh_female_vv_uranus_bigtts"></label>
            <label class="block text-sm text-muted">每日字符额度<input v-model.number="form.dailyNarrationCharacters" type="number" min="0" max="10000000" step="1" class="field-control mt-2 w-full px-3"></label>
          </section>
          <section class="border border-line rounded-panel p-4 space-y-4" aria-label="播客设置">
            <BaseSwitch v-model="form.podcastEnabled" label="双人播客" />
            <label class="block text-sm text-muted">资源 ID<input v-model="form.podcastResource" class="field-control mt-2 w-full px-3"></label>
            <label class="block text-sm text-muted">第一位主播音色 ID<input v-model="form.podcastSpeaker1" class="field-control mt-2 w-full px-3" placeholder="zh_male_dayixiansheng_v2_saturn_bigtts"></label>
            <label class="block text-sm text-muted">第二位主播音色 ID<input v-model="form.podcastSpeaker2" class="field-control mt-2 w-full px-3" placeholder="zh_female_mizaitongxue_v2_saturn_bigtts"></label>
            <label class="block text-sm text-muted">每日播客任务数<input v-model.number="form.dailyPodcasts" type="number" min="0" max="1000" step="1" class="field-control mt-2 w-full px-3"></label>
          </section>
        </div>
        <p class="text-xs text-muted leading-6">
          每日额度按北京时间重置，超额任务继续排队。重试也会预占额度；这是本站调用上限，实际费用以火山账单为准。切换音色后，旧音频暂不展示，可选择文章生成新版本。
        </p>
        <BaseButton type="submit" :disabled="busy">
          保存音频设置
        </BaseButton>
      </fieldset>
    </form>
    <template v-if="loaded">
      <div class="mb-4 mt-10 flex flex-wrap items-center gap-3">
        <h3 class="mr-auto text-title text-heading font-semibold">
          文章音频
        </h3>
        <BaseButton variant="border" :disabled="busy" @click="action(async () => '任务状态已刷新。')">
          刷新
        </BaseButton>
      </div>
      <p class="mb-5 text-xs text-muted">
        今日已预占 {{ list.usage.narrationCharacters }} 字朗读、{{ list.usage.podcasts }} 个播客任务。
      </p>
      <fieldset :disabled="busy || !form.enabled" class="mb-8 border border-line rounded-panel p-4 space-y-4">
        <legend class="px-2 text-sm text-heading">
          为已发布文章补齐音频
        </legend>
        <div class="max-h-60 overflow-y-auto">
          <label v-for="article in list.articles" :key="article.path" class="min-h-11 flex items-center gap-3 break-words py-2 text-sm has-[:disabled]:pointer-events-none has-[:disabled]:opacity-45"><input v-model="selected" type="checkbox" :value="article.path" class="shrink-0 accent-accent">{{ article.title }}</label>
        </div>
        <div class="flex flex-wrap gap-4">
          <label class="min-h-11 flex items-center gap-2 text-sm has-[:disabled]:pointer-events-none has-[:disabled]:opacity-45"><input v-model="kinds" type="checkbox" value="narration" class="accent-accent">全文朗读</label>
          <label class="min-h-11 flex items-center gap-2 text-sm has-[:disabled]:pointer-events-none has-[:disabled]:opacity-45"><input v-model="kinds" type="checkbox" value="podcast" class="accent-accent">双人播客</label>
        </div>
        <BaseButton :disabled="busy || !selected.length || selected.length > 50 || !kinds.length" @click="enqueue">
          生成所选文章（{{ selected.length }} / 50）
        </BaseButton>
      </fieldset>
      <p v-if="!list.jobs.length" class="text-sm text-muted">
        暂无音频任务。可以先选择一篇文章验收效果。
      </p>
      <div v-else class="space-y-4">
        <article v-for="job in list.jobs" :key="job.id" class="border border-line rounded-panel p-4">
          <div class="flex flex-wrap items-start gap-3">
            <h4 class="min-w-0 flex-1 break-words text-sm text-heading font-semibold">
              {{ job.title }} · {{ job.kind === 'narration' ? '全文朗读' : '双人播客' }}
            </h4>
            <span class="text-xs" :class="job.status === 'failed' || job.status === 'unknown' ? 'text-error' : 'text-muted'">{{ audioStatusLabel(job) }}{{ job.current ? '' : ' · 旧版本' }}</span>
          </div>
          <p v-if="job.message" class="mt-3 break-words text-xs text-muted leading-6">
            {{ job.message }}
          </p>
          <p v-if="job.providerId && (job.status === 'failed' || job.status === 'unknown')" class="mt-2 break-all text-xs text-muted">
            火山任务 ID：{{ job.providerId }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <BaseButton v-if="job.status === 'succeeded'" variant="border" :disabled="busy" @click="preview = preview?.id === job.id ? null : job">
              {{ preview?.id === job.id ? '关闭试听' : '试听' }}
            </BaseButton>
            <BaseButton v-if="job.status === 'succeeded' && job.publication !== 'public'" :disabled="busy || !job.current" @click="change(job, 'publish')">
              确认并公开
            </BaseButton>
            <BaseButton v-if="job.publication === 'public'" variant="border" :disabled="busy" @click="change(job, 'hide')">
              隐藏音频
            </BaseButton>
            <BaseButton v-if="job.resumable" variant="border" :disabled="busy || !job.current" @click="change(job, 'resume')">
              恢复原任务
            </BaseButton>
            <BaseButton v-if="job.status === 'failed' || job.status === 'unknown'" variant="border" :disabled="busy || !job.current || (job.status === 'unknown' && !acknowledgeCost)" @click="change(job, 'retry')">
              重新生成
            </BaseButton>
          </div>
          <ClientOnly><AudioPlayer v-if="preview?.id === job.id" :key="job.id" class="mt-4" :items="[{ id: job.id, kind: job.kind, url: endpoint(`/api/admin/audio/jobs/${job.id}/file`) }]" preview /></ClientOnly>
        </article>
      </div>
      <label v-if="list.jobs.some(job => job.status === 'unknown')" class="mt-5 min-h-11 flex items-center gap-3 text-sm text-warn"><input v-model="acknowledgeCost" type="checkbox" class="accent-accent">我已检查火山原任务，了解重新生成可能再次计费。</label>
    </template>
  </section>
</template>
