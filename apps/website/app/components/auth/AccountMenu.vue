<script setup lang="ts">
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui'
import { onMounted, ref, watch } from 'vue'
import { authMessages } from '#shared/auth/model'
import { statsEnabled } from '#shared/stats/model'

const auth = useAuthSession()
const { current, loaded, busy, error, loginOpen } = auth
const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
const linking = ref(false)
const enabled = import.meta.dev || statsEnabled(useRuntimeConfig().public.authEnabled)
onMounted(async () => {
  if (!enabled)
    return
  if (!loaded.value)
    await auth.refresh()
  const result = route.query.auth
  const failure = route.query.auth_error
  if (result === 'login' || result === 'verify') {
    loginOpen.value = true
    if (typeof failure === 'string')
      error.value = authMessages[failure] ?? authMessages.failed!
  }
  if (result || failure) {
    const query = { ...route.query }
    delete query.auth
    delete query.auth_error
    await router.replace({ path: route.path, query, hash: route.hash })
  }
})
watch(() => route.fullPath, () => {
  menuOpen.value = false
})
async function signOut() {
  try {
    await auth.logout()
    menuOpen.value = false
    if (route.path === '/admin' || route.path.startsWith('/admin/'))
      await navigateTo('/posts')
  }
  catch { /* Leave the menu open with the shared error. */ }
}
async function linkGoogle() {
  linking.value = true
  try {
    const result = await auth.linkGoogle(route.fullPath)
    await navigateTo(result.url, { external: true })
  }
  catch { linking.value = false }
}
</script>

<template>
  <template v-if="enabled">
    <DropdownMenuRoot v-if="current.user" v-model:open="menuOpen" :modal="false">
      <DropdownMenuTrigger as-child>
        <button type="button" class="icon-button" aria-label="账号菜单" title="账号菜单">
          <AccountAvatar :src="current.user.avatar" :name="current.user.name" class="size-8" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent align="end" :side-offset="8" :collision-padding="12" class="z-[80] max-w-[calc(100vw-24px)] w-72 border border-line-strong rounded-panel bg-surface p-2 text-sm text-ink shadow-floating outline-none" aria-label="账号菜单">
          <div class="flex items-center gap-3 p-3">
            <AccountAvatar :src="current.user.avatar" :name="current.user.name" class="size-11" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-heading font-medium">
                {{ current.user.name }}
              </p>
              <p class="mt-1 break-all text-xs text-muted">
                {{ current.user.email ?? '本地开发会话' }}
              </p>
            </div>
          </div>
          <DropdownMenuSeparator class="my-1 h-px bg-line" />
          <DropdownMenuItem v-if="current.user.role === 'admin'" as-child>
            <NuxtLink to="/admin" class="control-quiet min-h-11 flex cursor-pointer items-center gap-3 px-3 outline-none data-[highlighted]:bg-accent-surface data-[highlighted]:text-accent-soft" @click="menuOpen = false">
              <span class="i-lucide-layout-dashboard" aria-hidden="true" />前往后台
            </NuxtLink>
          </DropdownMenuItem>
          <DropdownMenuItem v-if="!current.user.local && current.providers.google && !current.linkedProviders.includes('google')" :disabled="busy || linking" class="control-quiet min-h-11 flex cursor-pointer items-center gap-3 px-3 text-muted outline-none data-[highlighted]:bg-accent-surface data-[highlighted]:text-accent-soft" @select.prevent="linkGoogle">
            <span class="i-lucide-link" aria-hidden="true" />{{ linking ? '正在前往关联…' : '关联 Google' }}
          </DropdownMenuItem>
          <DropdownMenuItem :disabled="busy || linking" class="control-quiet min-h-11 flex cursor-pointer items-center gap-3 px-3 outline-none data-[highlighted]:bg-accent-surface data-[highlighted]:text-accent-soft" @select.prevent="signOut">
            <span class="i-lucide-log-out" aria-hidden="true" />{{ busy ? '正在处理…' : '退出登录' }}
          </DropdownMenuItem>
          <p v-if="error" role="alert" class="p-3 text-xs text-error">
            {{ error }}
          </p>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
    <button v-else type="button" class="icon-button" :disabled="!loaded" :aria-label="loaded ? '登录' : '正在确认登录状态'" aria-haspopup="dialog" @click="loginOpen = true">
      <span :class="loaded ? 'i-lucide-user-round' : 'i-lucide-loader-circle animate-spin motion-reduce:animate-none'" aria-hidden="true" />
    </button>
    <LoginDialog />
  </template>
</template>
