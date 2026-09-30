<script setup lang="ts">
definePageMeta({ section: 'tools', pageKind: 'index', pageTitle: '工具' })

const route = useRoute()
const { isScrolled, scrollToTop } = useScrollToTop()
useActionButton({
  id: 'back',
  icon: 'i-lucide-wrench',
  label: '返回工具列表',
  order: 30,
  visible: () => route.path.replace(/\/+$/, '') !== '/tools',
  async onClick() {
    await navigateTo('/tools')
  },
})
useActionButton({
  id: 'top',
  icon: 'i-lucide-chevron-up',
  label: '回到页面顶部',
  order: 40,
  visible: isScrolled,
  onClick: scrollToTop,
})
</script>

<template>
  <NuxtPage />
</template>
