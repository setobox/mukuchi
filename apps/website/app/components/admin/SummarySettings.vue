<script setup lang="ts">
import type { AiSettingsView } from '#shared/ai/model'
import { defaultAiSettings } from '#shared/ai/model'

defineProps<{ locked?: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const { current, request } = useAdminSession()
const form = ref<AiSettingsView>({ ...defaultAiSettings, version: 0, keyConfigured: false, encryptionReady: false })
const apiKey = ref('')
const clearKey = ref(false)
const loaded = ref(false)
const busy = ref(false)
const message = ref('')
const error = ref('')
const { notify } = useAdminFeedback()
watch(message, value => value && notify(value))
async function load() {
  if (!current.value.user?.owner || loaded.value)
    return
  try {
    form.value = await request<AiSettingsView>('ai/settings')
    loaded.value = true
  }
  catch (cause) { error.value = adminError(cause) }
}
watch(() => current.value.user?.owner, load, { immediate: true })
async function save() {
  busy.value = true
  error.value = message.value = ''
  try {
    const { enabled, baseUrl, model, prompt, version } = form.value
    form.value = await request<AiSettingsView>('ai/settings', { method: 'PUT', body: { enabled, baseUrl, model, prompt, version, apiKey: apiKey.value || undefined, clearKey: clearKey.value } })
    apiKey.value = ''
    clearKey.value = false
    emit('saved')
    message.value = '设置已保存。后台生成立即生效，网站摘要在下一次构建中更新。'
  }
  catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
}
async function test() {
  busy.value = true
  error.value = message.value = ''
  try {
    message.value = (await request<{ message: string }>('ai/test', { method: 'POST' })).message
  }
  catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="max-w-3xl">
    <h2 class="mb-4 text-title text-heading font-semibold">
      AI 摘要
    </h2>
    <p v-if="error" role="alert" class="mb-5 text-error">
      {{ error }}
    </p>
    <p v-if="message" role="status" class="mb-5 text-muted">
      {{ message }}
    </p>
    <AdminSkeleton v-if="!loaded && !error" /><BaseButton v-if="!loaded && error" variant="border" @click="load">
      重试
    </BaseButton>
    <form v-if="loaded" class="space-y-6" @submit.prevent="save">
      <fieldset :disabled="busy || locked" class="space-y-6">
        <BaseSwitch v-model="form.enabled" label="启用 AI 摘要" />
        <label class="block text-sm text-muted">API 地址<input v-model="form.baseUrl" type="url" placeholder="https://服务地址/v1" autocomplete="off" class="field-control mt-2 w-full px-3"></label>
        <label class="block text-sm text-muted">模型<input v-model="form.model" type="text" autocomplete="off" class="field-control mt-2 w-full px-3"></label>
        <div>
          <label class="block text-sm text-muted">API 密钥<input v-model="apiKey" type="password" autocomplete="new-password" :disabled="!form.encryptionReady" :placeholder="form.keyConfigured ? '已配置；留空保留现有密钥' : '请输入 API 密钥'" class="field-control mt-2 w-full px-3"></label>
          <p v-if="!form.encryptionReady" class="mt-2 text-xs text-warn">
            服务端加密密钥尚未配置，暂时不能保存 API 密钥。
          </p>
          <label v-if="form.keyConfigured" class="ui-feedback mt-2 min-h-11 flex items-center gap-3 rounded-button text-xs text-error underline-offset-4 has-[:disabled]:pointer-events-none active:underline hover:underline has-[:disabled]:opacity-45"><input v-model="clearKey" type="checkbox" class="ui-feedback accent-error">删除已保存的密钥</label>
        </div>
        <label class="block text-sm text-muted">摘要提示词<textarea v-model="form.prompt" rows="6" required maxlength="6000" class="field-control mt-2 w-full p-3 leading-7" /></label>
        <p class="text-xs text-muted leading-6">
          默认输出 80–140 字的中文摘要。修改服务地址、模型或提示词后，下次构建会更新摘要。连接测试使用已保存的设置，会发送一次测试请求。
        </p>
        <div class="flex flex-wrap gap-3">
          <BaseButton type="submit" :loading="busy">
            {{ busy ? '处理中…' : '保存设置' }}
          </BaseButton>
          <BaseButton type="button" variant="border" :disabled="busy || !form.keyConfigured" @click="test">
            测试连接
          </BaseButton>
        </div>
      </fieldset>
    </form>
  </div>
</template>
