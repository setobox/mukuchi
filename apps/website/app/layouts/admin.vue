<script setup lang="ts">
const { current, loaded, refresh, localLogin, endpoint } = useAdminSession()
const error = ref('')
const open = ref(false)
const route = useRoute()
const navigation = [{ to: '/admin', label: '文章', icon: 'i-lucide-files' }, { to: '/admin/stats', label: '访问统计', icon: 'i-lucide-chart-no-axes-combined' }, { to: '/admin/publications', label: '发布记录', icon: 'i-lucide-history' }, { to: '/admin/ai', label: 'AI 设置', icon: 'i-lucide-text-search' }]
useSeoMeta({ robots: 'noindex, nofollow' })
onMounted(async () => {
  await refresh()
  if (!current.value.user && current.value.localAvailable) {
    try {
      await localLogin()
    }
    catch (cause) { error.value = adminError(cause) }
  }
})
watch(() => route.path, () => {
  open.value = false
})
</script>

<template>
  <div class="min-h-dvh">
    <header class="sticky top-0 z-header border-b border-line bg-canvas">
      <div class="mx-auto max-w-[1600px] min-h-17 flex items-center gap-2 px-5 md:gap-4 md:px-8">
        <button class="icon-button lg:hidden" aria-label="管理导航" :aria-expanded="open" @click="open = !open">
          <span class="i-lucide-menu" />
        </button>
        <NuxtLink to="/admin" class="text-link whitespace-nowrap font-semibold">
          mukuchi <span class="ml-2 hidden text-xs text-muted font-normal md:inline">管理后台</span>
        </NuxtLink>
        <span v-if="current.user?.local" class="hidden rounded bg-surface px-3 py-1 text-xs text-muted md:inline">本地开发</span>
        <div class="ml-auto flex items-center gap-2">
          <NuxtLink to="/posts" class="text-link whitespace-nowrap text-xs">
            查看网站
          </NuxtLink><ThemeToggle /><AccountMenu />
        </div>
      </div>
    </header>
    <div class="mx-auto max-w-[1600px] lg:grid lg:grid-cols-[210px_minmax(0,1fr)]">
      <nav v-if="current.user?.owner" :class="open ? 'block' : 'hidden lg:block'" class="border-b border-line p-5 lg:min-h-[calc(100dvh-68px)] lg:border-b-0 lg:border-r" aria-label="管理导航">
        <NuxtLink v-for="item in navigation" :key="item.to" :to="item.to" class="control-quiet mb-2 min-h-11 flex items-center gap-3 px-4 py-3" :class="(item.to === '/admin' ? route.path === '/admin' || route.path.startsWith('/admin/editor/') : route.path === item.to) ? 'control-selected' : 'text-muted'">
          <span :class="item.icon" />{{ item.label }}
        </NuxtLink>
      </nav>
      <main id="main-content" class="min-w-0 p-5 md:p-8">
        <p v-if="!loaded" role="status" class="text-muted">
          正在确认登录状态…
        </p>
        <template v-else-if="!current.user?.owner">
          <h1 class="mb-4 text-section text-heading">
            {{ current.user ? '无管理权限' : '登录管理后台' }}
          </h1>
          <p class="mb-6 text-muted">
            {{ current.user ? '此账户不是站主，无法访问管理后台。' : '请使用站主 GitHub 账户登录。' }}
          </p>
          <a v-if="current.loginAvailable" :href="endpoint('/api/auth/github')" class="text-link">使用 GitHub 登录</a>
          <p v-else-if="!current.localAvailable" class="text-muted">
            后台登录尚未配置。
          </p>
          <p v-if="error" role="alert" class="text-error">
            {{ error }}
          </p>
        </template>
        <slot v-else />
      </main>
    </div>
  </div>
</template>
