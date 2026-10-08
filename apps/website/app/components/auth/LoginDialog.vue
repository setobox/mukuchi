<script setup lang="ts">
import { ref, watch } from 'vue'

const auth = useAuthSession()
const { current, loginOpen, error, busy, loading, loaded } = auth
const route = useRoute()
const navigating = ref(false)
watch(loginOpen, (value) => {
  if (value)
    navigating.value = false
})
async function login() {
  navigating.value = true
  await navigateTo(auth.loginUrl(route.fullPath), { external: true })
}
</script>

<template>
  <AcrylicDialog v-model="loginOpen" title="登录" description="使用 MU³ ID 统一账号登录，注册与账号资料由账号中心管理。">
    <div class="space-y-4">
      <button type="button" class="control-base w-full border border-line-strong bg-surface px-5 py-3 text-heading justify-start! hover:border-accent" :disabled="!current.ssoAvailable || navigating || busy" @click="login">
        <span class="i-lucide-circle-user-round" aria-hidden="true" />{{ navigating ? '正在前往账号中心…' : '使用 MU³ ID 登录' }}
      </button>
      <p v-if="loaded && !current.ssoAvailable" class="text-sm text-muted">
        账号登录暂不可用，请稍后重试。
      </p>
      <NuxtLink v-if="current.localAvailable" to="/admin" class="text-link text-sm" @click="loginOpen = false">
        进入本地后台
      </NuxtLink>
      <p v-if="error" role="alert" class="text-sm text-error">
        {{ error }}
        <button type="button" class="text-link ml-2 text-sm" :disabled="loading" @click="auth.refresh()">
          重新检查
        </button>
      </p>
      <NuxtLink to="/privacy" class="text-link block text-center text-xs" @click="loginOpen = false">
        隐私说明
      </NuxtLink>
    </div>
  </AcrylicDialog>
</template>
