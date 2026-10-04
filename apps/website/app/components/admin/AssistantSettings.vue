<script setup lang="ts">
import type { AssistantCredentials, AssistantSettingsView } from '#shared/assistant/settings'
import { assistantCredentialsSchema, assistantSettingsSchema, defaultAssistantSettings, missingAssistantConfiguration, settingsViewSchema } from '#shared/assistant/settings'

const props = defineProps<{ active: boolean }>()
const section = defineModel<'config' | 'tasks'>('view', { default: 'config' })
const { current, request } = useAdminSession()
const view = ref<AssistantSettingsView>({ settings: { ...defaultAssistantSettings }, version: 0, configured: { modelKey: false, aliyunKeyId: false, aliyunKeySecret: false, turnstileSecret: false }, encryptionReady: false, verified: false })
const saved = ref({ ...defaultAssistantSettings })
const credentials = ref(assistantCredentialsSchema.parse({}))
const clearing = ref<(keyof AssistantCredentials)[]>([])
const loaded = ref(false)
const saving = ref(false)
const testing = ref(false)
const error = ref('')
const message = ref('')
const taskRevision = ref(0)
const focusTask = ref('')
const keyLabels: Record<keyof AssistantCredentials, string> = { modelKey: '模型 API 密钥', aliyunKeyId: '阿里云 AccessKey ID', aliyunKeySecret: '阿里云 AccessKey Secret', turnstileSecret: 'Turnstile Secret Key' }
const moderationKeys = ['aliyunKeyId', 'aliyunKeySecret'] as const
const capabilityKeys = ['baseUrl', 'model', 'style', 'region', 'queryService', 'responseService', 'turnstileSiteKey'] as const
const credentialChanged = computed(() => clearing.value.length > 0 || Object.values(credentials.value).some(Boolean))
const requiresVerification = computed(() => credentialChanged.value || capabilityKeys.some(key => saved.value[key] !== view.value.settings[key]))
const dirty = computed(() => loaded.value && (credentialChanged.value || JSON.stringify(saved.value) !== JSON.stringify(view.value.settings)))
const credentialActive = computed(() => props.active && section.value === 'config')
const hasCredential = (key: keyof AssistantCredentials) => !clearing.value.includes(key) && (!!credentials.value[key] || view.value.configured[key])
const missing = computed(() => missingAssistantConfiguration(view.value.settings, { modelKey: hasCredential('modelKey'), aliyunKeyId: hasCredential('aliyunKeyId'), aliyunKeySecret: hasCredential('aliyunKeySecret'), turnstileSecret: hasCredential('turnstileSecret') }))
const numericFields = [
  { key: 'guestMinute', label: '访客每分钟提问次数' },
  { key: 'guestDay', label: '访客每日提问次数' },
  { key: 'userMinute', label: '账号每分钟提问次数' },
  { key: 'userDay', label: '账号每日提问次数' },
  { key: 'ipMinute', label: '每 IP 每分钟提问次数' },
  { key: 'ipDay', label: '每 IP 每日提问次数' },
  { key: 'concurrency', label: '全站同时生成上限' },
] as const
async function load() {
  if (current.value.user?.role !== 'admin')
    return
  error.value = ''
  try {
    view.value = settingsViewSchema.parse(await request<unknown>('assistant/settings'))
    saved.value = { ...view.value.settings }
    loaded.value = true
    taskRevision.value++
  }
  catch (cause) { error.value = adminError(cause) }
}
watch(() => current.value.user?.role, load, { immediate: true })
async function save() {
  if (saving.value || testing.value)
    return false
  saving.value = true
  error.value = message.value = ''
  try {
    const settings = assistantSettingsSchema.parse({ ...view.value.settings, enabled: requiresVerification.value || !view.value.verified ? false : view.value.settings.enabled })
    view.value = settingsViewSchema.parse(await request<unknown>('assistant/settings', { method: 'PUT', body: { settings, version: view.value.version, credentials: credentials.value, clearCredentials: clearing.value } }))
    saved.value = { ...view.value.settings }
    credentials.value = assistantCredentialsSchema.parse({})
    clearing.value = []
    message.value = view.value.verified ? '设置已保存，已有验证仍有效。' : '设置已保存，助手保持关闭。请测试通过后开启并保存。'
    taskRevision.value++
    return true
  }
  catch (cause) {
    error.value = cause instanceof Error && cause.name === 'ZodError' ? '配置数值或地址不符合要求，请检查表单。' : adminError(cause)
    if (props.active)
      section.value = 'config'
    return false
  }
  finally { saving.value = false }
}
async function testCapabilities() {
  if (saving.value || testing.value || missing.value.length)
    return
  if ((dirty.value || !view.value.version) && !await save())
    return
  testing.value = true
  error.value = message.value = ''
  focusTask.value = crypto.randomUUID()
  if (props.active)
    section.value = 'tasks'
  try {
    const result = await request<{ message: string, taskId: string }>('assistant/test', { method: 'POST', body: { version: view.value.version, requestId: focusTask.value } })
    message.value = result.message
    await load()
  }
  catch (cause) { error.value = adminError(cause) }
  finally {
    testing.value = false
    taskRevision.value++
  }
}
</script>

<template>
  <AiSettingsPanel v-model:enabled="view.settings.enabled" v-model:view="section" title="对话助手" :loaded="loaded" :dirty="dirty" :saving="saving" :testing="testing" test-label="测试能力" :test-disabled="missing.length > 0 || !view.encryptionReady" :status="loaded ? view.verified && !requiresVerification ? '已通过验证' : '需重新验证' : ''" :hint="requiresVerification ? '保存后需重新验证，助手将先停用。' : ''" @save="save" @test="testCapabilities">
    <template #feedback>
      <p v-if="error" role="alert" class="mb-4 text-error">
        {{ error }}
      </p>
      <p v-if="message" role="status" class="mb-4 text-sm text-muted">
        {{ message }}
      </p>
      <AdminSkeleton v-if="!loaded && !error" />
      <BaseButton v-if="!loaded && error" variant="border" @click="load">
        重试
      </BaseButton>
    </template>
    <template #config>
      <form v-if="loaded" class="max-w-4xl" @submit.prevent="save">
        <fieldset :disabled="saving || testing" class="space-y-5">
          <p v-if="missing.length" class="text-xs text-warn">
            尚未配置：{{ missing.join('、') }}。
          </p>
          <p v-if="!view.encryptionReady" class="text-xs text-warn">
            服务端加密密钥尚未配置，无法保存凭据。
          </p>
          <section class="border border-line rounded-panel p-5 space-y-5" aria-label="助手模型服务">
            <h3 class="text-heading font-medium">
              模型服务
            </h3>
            <p class="text-xs text-muted">
              能力测试检查审核、工具调用和结构化回答。聊天正文只保存在读者浏览器，后台仅保留最近 30 天的任务状态与诊断。
            </p>
            <div class="grid gap-5 md:grid-cols-2">
              <label class="block text-sm text-muted">服务地址<input v-model="view.settings.baseUrl" type="url" autocomplete="off" placeholder="https://服务地址/v1" class="field-control mt-2 w-full px-3"></label>
              <label class="block text-sm text-muted">模型名称<input v-model="view.settings.model" autocomplete="off" class="field-control mt-2 w-full px-3"></label>
            </div>
            <SavedCredential v-model="credentials.modelKey" service="assistant" field="modelKey" :label="keyLabels.modelKey" :configured="view.configured.modelKey" :revision="view.version" :active="credentialActive" :disabled="!view.encryptionReady" />
            <label v-if="view.configured.modelKey" class="checkbox-field min-h-11 flex items-center gap-3 text-xs text-error"><input v-model="clearing" value="modelKey" type="checkbox" class="accent-error">删除模型密钥</label>
            <label class="block text-sm text-muted">交流风格<textarea v-model="view.settings.style" maxlength="1000" rows="3" class="field-control mt-2 w-full p-3" /></label>
          </section>
          <section class="border border-line rounded-panel p-5 space-y-5" aria-label="助手安全审核">
            <h3 class="text-heading font-medium">
              安全审核
            </h3>
            <p class="text-xs text-muted">
              输入、输出策略均需开启内容合规和提示词攻击检测，无需开启敏感内容检测。只有审核明确通过，回答才会展示。
            </p>
            <BaseSelect v-model="view.settings.region" label="阿里云地域" :disabled="saving || testing" :options="assistantSettingsSchema.shape.region.unwrap().options.map(value => ({ value, label: value }))" />
            <div v-for="key in moderationKeys" :key="key">
              <SavedCredential v-model="credentials[key]" service="assistant" :field="key" :label="keyLabels[key]" :configured="view.configured[key]" :revision="view.version" :active="credentialActive" :disabled="!view.encryptionReady" />
              <label v-if="view.configured[key]" class="checkbox-field mt-2 min-h-11 flex items-center gap-3 text-xs text-error"><input v-model="clearing" :value="key" type="checkbox" class="accent-error">删除{{ keyLabels[key] }}</label>
            </div>
            <div class="grid gap-5 md:grid-cols-2">
              <label class="block text-sm text-muted">输入审核服务<input v-model="view.settings.queryService" class="field-control mt-2 w-full px-3"></label>
              <label class="block text-sm text-muted">输出审核服务<input v-model="view.settings.responseService" class="field-control mt-2 w-full px-3"></label>
            </div>
          </section>
          <section class="border border-line rounded-panel p-5 space-y-5" aria-label="助手访客验证">
            <h3 class="text-heading font-medium">
              访客验证
            </h3>
            <label class="block text-sm text-muted">Turnstile Site Key<input v-model="view.settings.turnstileSiteKey" autocomplete="off" class="field-control mt-2 w-full px-3"></label>
            <SavedCredential v-model="credentials.turnstileSecret" service="assistant" field="turnstileSecret" :label="keyLabels.turnstileSecret" :configured="view.configured.turnstileSecret" :revision="view.version" :active="credentialActive" :disabled="!view.encryptionReady" />
            <label v-if="view.configured.turnstileSecret" class="checkbox-field min-h-11 flex items-center gap-3 text-xs text-error"><input v-model="clearing" value="turnstileSecret" type="checkbox" class="accent-error">删除 Turnstile 密钥</label>
            <p class="text-xs text-muted">
              验证码配置的 action 为 assistant。
            </p>
          </section>
          <section class="border border-line rounded-panel p-5 space-y-5" aria-label="助手次数限制">
            <h3 class="text-heading font-medium">
              次数限制
            </h3>
            <div class="grid gap-5 md:grid-cols-2">
              <label v-for="field in numericFields" :key="field.key" class="block text-sm text-muted">{{ field.label }}<input v-model.number="view.settings[field.key]" type="number" min="1" step="1" required class="field-control mt-2 w-full px-3"></label>
            </div>
            <p class="text-xs text-muted">
              能力测试计入管理员提问次数，调整次数限制无需重新验证。
            </p>
          </section>
        </fieldset>
      </form>
    </template>
    <template #tasks>
      <AssistantTasks v-if="loaded" :active="props.active && section === 'tasks'" :focus-id="focusTask" :revision="taskRevision" />
    </template>
  </AiSettingsPanel>
</template>
