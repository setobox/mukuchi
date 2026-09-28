<script setup lang="ts">
import type { AuthProvider } from '#shared/auth/model'
import { useNow } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

const auth = useAuthSession()
const { current, loginOpen, error, busy, loading, loaded } = auth
const route = useRoute()
const now = useNow({ interval: 1000 })
const code = ref('')
const verifying = ref(true)
const navigating = ref(false)
const pending = computed(() => verifying.value ? current.value.pendingVerification : null)
const cooldown = computed(() => Math.max(0, Math.ceil(((pending.value?.resendAfter ?? 0) - now.value.getTime()) / 1000)))
const providers: { id: AuthProvider, label: string, icon: string }[] = [{ id: 'github', label: 'GitHub', icon: 'i-lucide-github' }, { id: 'google', label: 'Google', icon: 'i-logos-google-icon' }]
watch(loginOpen, (value) => {
  if (value) {
    code.value = ''
    verifying.value = true
    navigating.value = false
  }
})
async function login(provider: AuthProvider) {
  navigating.value = true
  await navigateTo(auth.loginUrl(provider, route.fullPath), { external: true })
}
async function resend() {
  try {
    await auth.sendCode()
  }
  catch { /* Shared error is rendered below. */ }
}
async function verify() {
  try {
    const result = await auth.verifyCode(code.value)
    loginOpen.value = false
    await navigateTo(result.returnTo, { external: true })
  }
  catch { /* Keep the code entry available for correction. */ }
}
</script>

<template>
  <AcrylicDialog v-model="loginOpen" :title="pending ? '验证邮箱' : '登录'" :description="pending ? '输入邮件中的验证码，完成账号注册。' : '选择登录方式，首次登录将自动注册。'">
    <div class="flex flex-col gap-4">
      <p v-if="!loaded || loading" role="status" class="text-muted">
        正在确认登录状态…
      </p>
      <form v-else-if="pending" class="flex flex-col gap-4" @submit.prevent="verify">
        <p class="break-all text-heading">
          {{ pending.email }}
        </p>
        <label class="flex flex-col gap-2 text-muted">
          六位验证码
          <input v-model="code" class="field-control w-full px-4 text-heading tracking-[0.3em] font-mono" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required :disabled="busy" placeholder="000000">
        </label>
        <BaseButton type="submit" :disabled="busy || !/^\d{6}$/.test(code)">
          {{ busy ? '正在处理…' : '验证并登录' }}
        </BaseButton>
        <div class="flex flex-wrap justify-between gap-2">
          <button type="button" class="text-link text-sm" :disabled="busy || cooldown > 0" @click="resend">
            {{ cooldown > 0 ? `${cooldown} 秒后重新发送` : '重新发送验证码' }}
          </button>
          <button type="button" class="text-link text-sm" :disabled="busy" @click="verifying = false; error = ''">
            换一种登录方式
          </button>
        </div>
      </form>
      <template v-else>
        <button v-for="provider in providers" :key="provider.id" type="button" class="control-base w-full border border-line-strong bg-surface px-5 py-3 text-heading justify-start! hover:border-accent" :disabled="!current.providers[provider.id] || navigating || busy" @click="login(provider.id)">
          <span :class="provider.icon" class="size-5" aria-hidden="true" />
          <span class="flex-1 text-left">{{ navigating ? '正在前往登录…' : `使用 ${provider.label} 登录` }}</span>
          <span v-if="!current.providers[provider.id]" class="text-xs text-muted">暂不可用</span>
        </button>
        <NuxtLink v-if="current.localAvailable" to="/admin" class="text-link text-sm" @click="loginOpen = false">
          进入本地管理
        </NuxtLink>
      </template>
      <div v-if="error" role="alert" class="rounded-button bg-surface p-3 text-sm text-error">
        {{ error }}
        <button v-if="!pending" type="button" class="text-link ml-2 text-sm" :disabled="loading" @click="auth.refresh()">
          刷新状态
        </button>
      </div>
      <NuxtLink to="/privacy" class="text-link text-center text-xs" @click="loginOpen = false">
        账号隐私说明
      </NuxtLink>
    </div>
  </AcrylicDialog>
</template>
