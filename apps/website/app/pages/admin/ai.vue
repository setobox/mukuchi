<script setup lang="ts">
import type { AiSettingsView } from '#shared/ai/model'
import { defaultAiSettings } from '#shared/ai/model'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'AI 摘要设置' })
const { current, request } = useAdminSession()
const form = ref<AiSettingsView>({ ...defaultAiSettings, version: 0, keyConfigured: false, encryptionReady: false })
const apiKey = ref('')
const clearKey = ref(false)
const loaded = ref(false)
const busy = ref(false)
const message = ref('')
const error = ref('')
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
    <h1 class="mb-6 text-section text-heading font-semibold">
      AI 摘要
    </h1>
    <p v-if="error" role="alert" class="mb-5 text-error">
      {{ error }}
    </p>
    <p v-if="message" role="status" class="mb-5 text-muted">
      {{ message }}
    </p>
    <form v-if="loaded" class="space-y-6" @submit.prevent="save">
      <fieldset :disabled="busy" class="space-y-6">
        <label class="min-h-11 flex items-center gap-3"><input v-model="form.enabled" type="checkbox">启用 AI 摘要</label>
        <label class="block text-sm text-muted">API 地址<input v-model="form.baseUrl" type="url" placeholder="https://服务地址/v1" autocomplete="off" class="mt-2 min-h-11 w-full border border-line-strong rounded-button bg-canvas px-3 text-ink"></label>
        <label class="block text-sm text-muted">模型<input v-model="form.model" type="text" autocomplete="off" class="mt-2 min-h-11 w-full border border-line-strong rounded-button bg-canvas px-3 text-ink"></label>
        <div>
          <label class="block text-sm text-muted">API 密钥<input v-model="apiKey" type="password" autocomplete="new-password" :disabled="!form.encryptionReady" :placeholder="form.keyConfigured ? '已配置；留空保留现有密钥' : '请输入 API 密钥'" class="mt-2 min-h-11 w-full border border-line-strong rounded-button bg-canvas px-3 text-ink"></label>
          <p v-if="!form.encryptionReady" class="mt-2 text-xs text-warn">
            服务端加密密钥尚未配置，暂时不能保存 API 密钥。
          </p>
          <label v-if="form.keyConfigured" class="mt-2 min-h-11 flex items-center gap-3 text-xs text-muted"><input v-model="clearKey" type="checkbox">删除已保存的密钥</label>
        </div>
        <label class="block text-sm text-muted">摘要提示词<textarea v-model="form.prompt" rows="6" required maxlength="6000" class="mt-2 w-full border border-line-strong rounded-button bg-canvas p-3 text-ink leading-7" /></label>
        <p class="text-xs text-muted leading-6">
          默认输出 80–140 字的中文摘要。修改服务地址、模型或提示词后，下次构建会更新摘要。连接测试使用已保存的设置，会发送一次测试请求。
        </p>
        <div class="flex flex-wrap gap-3">
          <BaseButton type="submit" :disabled="busy">
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
