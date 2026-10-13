<script setup lang="ts">
import type { SocialLoginProvider } from '#shared/auth/model'
import { ref, watch } from 'vue'

const auth = useAuthSession()
const { current, loginOpen, error, busy, loading, loaded } = auth
const route = useRoute()
const navigating = ref<SocialLoginProvider | 'email' | null>(null)
const methods: { id: SocialLoginProvider | 'email', label: string, icon: string }[] = [
  { id: 'email', label: '邮箱', icon: 'i-lucide-mail' },
  { id: 'github', label: 'GitHub', icon: 'i-lucide-github' },
  { id: 'google', label: 'Google', icon: 'i-logos-google-icon' },
]
watch(loginOpen, (value) => {
  if (value)
    navigating.value = null
})
async function login(method: SocialLoginProvider | 'email') {
  if (navigating.value || busy.value || !current.value.ssoAvailable)
    return
  navigating.value = method
  error.value = ''
  try {
    await navigateTo(auth.loginUrl(route.fullPath, method === 'email' ? undefined : method), { external: true })
  }
  catch {
    navigating.value = null
    error.value = '无法打开登录页面，请重试。'
  }
}
</script>

<template>
  <AcrylicDialog v-model="loginOpen" title="GET STARTED" description="选择你登录的方式">
    <div class="space-y-4">
      <button v-for="method in methods" :key="method.id" type="button" class="control-base w-full border border-line-strong bg-surface px-5 py-3 text-heading justify-start! hover:border-accent" :disabled="!current.ssoAvailable || Boolean(navigating) || busy" @click="login(method.id)">
        <span :class="method.icon" aria-hidden="true" />{{ navigating === method.id ? '正在跳转…' : method.label }}
      </button>
      <p v-if="loaded && !current.ssoAvailable" class="text-sm text-muted">
        账号登录暂不可用，请稍后重试。
      </p>
      <p v-if="error" role="alert" class="text-sm text-error">
        {{ error }}
        <button type="button" class="text-link ml-2 text-sm" :disabled="loading" @click="auth.refresh()">
          重新检查
        </button>
      </p>
    </div>
  </AcrylicDialog>
</template>
