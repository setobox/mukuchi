<script setup lang="ts">
import type { AiSettingsView } from '#shared/ai/model'
import { aiSettingsSchema, defaultAiSettings } from '#shared/ai/model'
import BaseHelpHint from '~/components/base/BaseHelpHint.vue'

const props = defineProps<{ active: boolean }>()
const section = defineModel<'config' | 'tasks'>('view', { default: 'config' })
const { current, request } = useAdminSession()
const form = ref<AiSettingsView>({ ...defaultAiSettings, version: 0, keyConfigured: false, encryptionReady: false })
const saved = ref({ ...defaultAiSettings })
const apiKey = ref('')
const clearKey = ref(false)
const loaded = ref(false)
const saving = ref(false)
const testing = ref(false)
const taskBusy = ref(false)
const revision = ref(0)
const message = ref('')
const error = ref('')
const { notify } = useAdminFeedback()
const settings = () => ({ enabled: form.value.enabled, baseUrl: form.value.baseUrl, model: form.value.model, prompt: form.value.prompt })
const dirty = computed(() => loaded.value && (!!apiKey.value || clearKey.value || JSON.stringify(settings()) !== JSON.stringify(saved.value)))
const canTest = computed(() => !!form.value.baseUrl && !!form.value.model && !clearKey.value && (!!apiKey.value || form.value.keyConfigured))
async function load() {
  if (current.value.user?.role !== 'admin' || loaded.value)
    return
  error.value = ''
  try {
    form.value = await request<AiSettingsView>('ai/settings')
    saved.value = settings()
    loaded.value = true
  }
  catch (cause) { error.value = adminError(cause) }
}
watch(() => current.value.user?.role === 'admin', load, { immediate: true })
async function save() {
  if (saving.value || testing.value || taskBusy.value)
    return false
  saving.value = true
  error.value = message.value = ''
  try {
    const config = aiSettingsSchema.parse(settings())
    form.value = await request<AiSettingsView>('ai/settings', { method: 'PUT', body: { ...config, version: form.value.version, apiKey: apiKey.value || undefined, clearKey: clearKey.value } })
    saved.value = settings()
    apiKey.value = ''
    clearKey.value = false
    revision.value++
    message.value = '设置已保存。网站摘要在下一次构建中更新。'
    notify(message.value)
    return true
  }
  catch (cause) {
    error.value = cause instanceof Error && cause.name === 'ZodError' ? '请检查服务地址、模型和提示词。' : adminError(cause)
    if (props.active)
      section.value = 'config'
    return false
  }
  finally { saving.value = false }
}
async function test() {
  if (saving.value || testing.value || taskBusy.value || !canTest.value)
    return
  if (dirty.value && !await save())
    return
  testing.value = true
  error.value = message.value = ''
  try {
    message.value = (await request<{ message: string }>('ai/test', { method: 'POST' })).message
  }
  catch (cause) { error.value = adminError(cause) }
  finally { testing.value = false }
}
</script>

<template>
  <AiSettingsPanel v-model:enabled="form.enabled" v-model:view="section" title="AI 摘要" :loaded="loaded" :dirty="dirty" :saving="saving" :testing="testing" :locked="taskBusy" test-label="测试连接" :test-disabled="!canTest" @save="save" @test="test">
    <template #feedback>
      <p v-if="error" role="alert" class="mb-5 text-error">
        {{ error }}
      </p>
      <p v-if="message" role="status" class="mb-5 text-sm text-muted">
        {{ message }}
      </p>
      <AdminSkeleton v-if="!loaded && !error" />
      <BaseButton v-if="!loaded && error" variant="border" @click="load">
        重试
      </BaseButton>
    </template>
    <template #config>
      <form v-if="loaded" class="max-w-4xl space-y-5" @submit.prevent="save">
        <fieldset :disabled="saving || testing || taskBusy" class="space-y-5">
          <section class="border border-line rounded-panel p-5 space-y-5" aria-label="摘要模型服务">
            <h3 class="text-heading font-medium">
              模型服务
            </h3>
            <div class="grid gap-5 md:grid-cols-2">
              <label class="block text-sm text-muted">API 地址<input v-model="form.baseUrl" type="url" placeholder="https://服务地址/v1" autocomplete="off" class="field-control mt-2 w-full px-3"></label>
              <label class="block text-sm text-muted">模型<input v-model="form.model" type="text" autocomplete="off" class="field-control mt-2 w-full px-3"></label>
            </div>
            <SavedCredential v-model="apiKey" service="ai" field="apiKey" label="API 密钥" :configured="form.keyConfigured" :revision="form.version" :active="props.active && section === 'config'" :disabled="!form.encryptionReady" />
            <p v-if="!form.encryptionReady" class="text-xs text-warn">
              服务端加密密钥尚未配置，暂时不能保存 API 密钥。
            </p>
            <label v-if="form.keyConfigured" class="checkbox-field min-h-11 flex items-center gap-3 text-xs text-error"><input v-model="clearKey" type="checkbox" class="accent-error">删除已保存的密钥</label>
          </section>
          <section class="border border-line rounded-panel p-5 space-y-4">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-heading font-medium">
                摘要生成
              </h3>
              <BaseHelpHint label="生成与测试说明" text="默认输出 80–140 字的中文摘要。修改服务地址、模型或提示词后，下次构建会更新摘要。连接测试会发送一次测试请求，有修改时先保存再测试。" :active="props.active && section === 'config'" />
            </div>
            <label class="block text-sm text-muted">提示词<textarea v-model="form.prompt" rows="5" required maxlength="6000" class="field-control mt-2 w-full p-3 leading-7" /></label>
          </section>
        </fieldset>
      </form>
    </template>
    <template #tasks>
      <SummaryManager :revision="revision" @busy="taskBusy = $event" />
    </template>
  </AiSettingsPanel>
</template>
