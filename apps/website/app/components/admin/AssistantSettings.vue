<script setup lang="ts">
import type { AssistantCredentials, AssistantSettingsView } from '#shared/assistant/settings'
import { assistantCredentialsSchema, assistantSettingsSchema, defaultAssistantSettings, settingsViewSchema } from '#shared/assistant/settings'

const { current, request } = useAdminSession()
const view = ref<AssistantSettingsView>({ settings: { ...defaultAssistantSettings }, version: 0, configured: { modelKey: false, aliyunKeyId: false, aliyunKeySecret: false, turnstileSecret: false }, encryptionReady: false, verified: false })
const credentials = ref(assistantCredentialsSchema.parse({}))
const clearing = ref<(keyof AssistantCredentials)[]>([])
const loaded = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
const budgetRefreshKey = ref(0)
const budgetInput = ref<HTMLInputElement | null>(null)
function editBudget() {
  budgetInput.value?.scrollIntoView({ block: 'center' })
  budgetInput.value?.focus({ preventScroll: true })
}
const keyLabels: Record<keyof AssistantCredentials, string> = { modelKey: '模型 API 密钥', aliyunKeyId: '阿里云 AccessKey ID', aliyunKeySecret: '阿里云 AccessKey Secret', turnstileSecret: 'Turnstile Secret Key' }
const numericFields = [
  { key: 'inputPriceMicrosPerMillion', label: '模型每百万输入 token 的价格上界（微元）' },
  { key: 'outputPriceMicrosPerMillion', label: '模型每百万输出 token 的价格上界（微元）' },
  { key: 'moderationPriceMicros', label: '单次审核全部维度合计价格上界（微元）' },
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
  try {
    view.value = settingsViewSchema.parse(await request<unknown>('assistant/settings'))
    loaded.value = true
    budgetRefreshKey.value++
  }
  catch (cause) { error.value = adminError(cause) }
}
watch(() => current.value.user?.role, load, { immediate: true })
async function save() {
  busy.value = true
  error.value = message.value = ''
  try {
    const settings = assistantSettingsSchema.parse(view.value.settings)
    view.value = settingsViewSchema.parse(await request<unknown>('assistant/settings', { method: 'PUT', body: { settings, version: view.value.version, credentials: credentials.value, clearCredentials: clearing.value } }))
    credentials.value = assistantCredentialsSchema.parse({})
    clearing.value = []
    message.value = view.value.verified ? '设置已保存，已有能力验证仍有效。' : '设置已保存。修改配置后需重新进行能力测试。'
    budgetRefreshKey.value++
  }
  catch (cause) { error.value = cause instanceof Error && cause.name === 'ZodError' ? '配置数值或地址不符合要求，请检查表单' : adminError(cause) }
  finally { busy.value = false }
}
async function testCapabilities() {
  busy.value = true
  error.value = message.value = ''
  try {
    const result = await request<{ message: string }>('assistant/test', { method: 'POST', body: { version: view.value.version } })
    message.value = result.message
    await load()
  }
  catch (cause) { error.value = adminError(cause) }
  finally {
    busy.value = false
    budgetRefreshKey.value++
  }
}
</script>

<template>
  <section class="max-w-3xl">
    <h2 class="mb-4 text-title text-heading font-semibold">
      对话助手
    </h2>
    <p class="mb-5 text-sm text-muted">
      使用独立模型和安全审核配置。聊天历史只在读者浏览器的 IndexedDB 中保存，不自动过期。
    </p>
    <p v-if="error" role="alert" class="mb-4 text-error">
      {{ error }}
    </p>
    <p v-if="message" role="status" class="mb-4 text-muted">
      {{ message }}
    </p>
    <AdminSkeleton v-if="!loaded && !error" />
    <BaseButton v-if="!loaded && error" variant="border" @click="load">
      重试
    </BaseButton>
    <AssistantBudget v-if="loaded" :refresh-key="budgetRefreshKey" @edit-limit="editBudget" />
    <form v-if="loaded" class="space-y-6" @submit.prevent="save">
      <fieldset :disabled="busy" class="space-y-6">
        <BaseSwitch v-model="view.settings.enabled" label="启用对话助手" />
        <p class="text-xs text-muted">
          {{ view.verified ? '已保存配置通过能力测试。' : '请先关闭开关保存配置，再测试能力，最后启用。' }}
        </p>
        <label class="block text-sm text-muted">Chat Completions 兼容服务地址<input v-model="view.settings.baseUrl" type="url" autocomplete="off" placeholder="https://服务地址/v1" class="field-control mt-2 w-full px-3"></label>
        <label class="block text-sm text-muted">模型名称<input v-model="view.settings.model" autocomplete="off" class="field-control mt-2 w-full px-3"></label>
        <label class="block text-sm text-muted">交流风格<textarea v-model="view.settings.style" maxlength="1000" rows="3" class="field-control mt-2 w-full p-3" /></label>
        <div class="sm:grid-cols-2 grid gap-5">
          <label class="block text-sm text-muted">阿里云地域<select v-model="view.settings.region" class="field-control mt-2 w-full px-3"><option v-for="region in assistantSettingsSchema.shape.region.unwrap().options" :key="region" :value="region">{{ region }}</option></select></label>
          <label class="block text-sm text-muted">Turnstile Site Key<input v-model="view.settings.turnstileSiteKey" autocomplete="off" class="field-control mt-2 w-full px-3"></label>
          <label class="block text-sm text-muted">输入审核服务<input v-model="view.settings.queryService" class="field-control mt-2 w-full px-3"></label>
          <label class="block text-sm text-muted">输出审核服务<input v-model="view.settings.responseService" class="field-control mt-2 w-full px-3"></label>
        </div>
        <p class="text-xs text-muted">
          输入、输出策略均需开启内容合规和提示词攻击检测，无需开启敏感内容检测。审核明确通过才展示回答；验证码配置的 action 为 assistant。
        </p>
        <p v-if="!view.encryptionReady" class="text-xs text-warn">
          服务端尚未配置 NUXT_AI_ENCRYPTION_KEY，无法保存密钥。
        </p>
        <div v-for="(label, key) in keyLabels" :key="key">
          <label class="block text-sm text-muted">{{ label }}<input v-model="credentials[key]" type="password" autocomplete="new-password" :disabled="!view.encryptionReady" :placeholder="view.configured[key] ? '已配置；留空保留' : '尚未配置'" class="field-control mt-2 w-full px-3"></label>
          <label v-if="view.configured[key]" class="mt-2 flex gap-2 text-xs text-error"><input v-model="clearing" :value="key" type="checkbox">删除此密钥</label>
        </div>
        <div class="sm:grid-cols-2 grid gap-5">
          <label class="block text-sm text-muted">每日额度上限（微元，1 元 = 1,000,000 微元）<input ref="budgetInput" v-model.number="view.settings.dailyBudgetMicros" type="number" min="1" step="1" required class="field-control mt-2 w-full px-3"></label>
          <label v-for="field in numericFields" :key="field.key" class="block text-sm text-muted">{{ field.label }}<input v-model.number="view.settings[field.key]" type="number" min="0" step="1" required class="field-control mt-2 w-full px-3"></label>
        </div>
        <p class="text-xs text-muted">
          预算默认 5 元／天，包含模型与审核。价格填写保守上界，需覆盖实际检测维度与计费方式；供应商价格变化时请同步更新。未知用量、超时或中断按预留上界计费，不自动重试。
        </p>
        <p class="text-xs text-muted">
          能力测试依次检查正常文本放行、攻击样本拦截、站点资料工具调用、结构化 JSON 回答及用量。完整通过时发送 2 次模型请求和 6 次审核请求，计入当日预算，失败即停止，不保存聊天正文。只支持可用 UTF-8 字节数给出保守输入 token 上界的供应商；上线时同时设置供应商消费告警。
        </p>
        <div class="flex flex-wrap gap-3">
          <BaseButton type="submit" :loading="busy">
            保存设置
          </BaseButton>
          <BaseButton type="button" variant="border" :disabled="busy || !view.version" @click="testCapabilities">
            测试能力与审核
          </BaseButton>
        </div>
      </fieldset>
    </form>
  </section>
</template>
