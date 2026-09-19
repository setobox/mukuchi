<script setup lang="ts">
import { statsEnabled } from '#shared/stats/model'

const { current, loaded, refresh, logout, endpoint } = useAdminSession()
const open = ref(false)
const enabled = import.meta.dev || statsEnabled(useRuntimeConfig().public.authEnabled)
onMounted(() => {
  if (enabled && !loaded.value)
    void refresh()
})
const error = ref('')
async function signOut() {
  try {
    await logout()
    open.value = false
  }
  catch (cause) { error.value = adminError(cause) }
}
</script>

<template>
  <AcrylicDialog v-if="enabled" v-model="open" title="账户">
    <template #trigger="{ toggle }">
      <button type="button" class="icon-button" aria-label="账户" @click="toggle">
        <span class="i-lucide-user-round" />
      </button>
    </template>
    <div class="flex flex-col gap-4">
      <template v-if="current.user">
        <p class="text-heading">
          {{ current.user.login }}
        </p>
        <NuxtLink v-if="current.user.owner" to="/admin" class="text-link" @click="open = false">
          进入管理后台
        </NuxtLink>
        <BaseButton variant="border" @click="signOut">
          退出网站登录
        </BaseButton>
      </template>
      <template v-else>
        <a v-if="current.loginAvailable" :href="endpoint('/api/auth/github')" class="button-primary px-5 py-3 text-center">使用 GitHub 登录</a>
        <p v-else class="text-muted">
          GitHub 登录尚未配置。
        </p>
        <NuxtLink v-if="current.localAvailable" to="/admin" class="text-link" @click="open = false">
          进入本地管理
        </NuxtLink>
      </template>
      <p v-if="error" role="alert" class="text-error">
        {{ error }}
      </p>
    </div>
  </AcrylicDialog>
</template>
