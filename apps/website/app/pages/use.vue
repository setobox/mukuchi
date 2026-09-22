<script setup lang="ts">
definePageMeta({ section: 'about', pageKind: 'index', pageTitle: 'Use', parentPath: '/about' })
const { data: usePage, error } = await useAsyncData('page:use', () =>
  queryCollection('use').path('/use').first())
if (error.value)
  throw createError({ statusCode: 500, message: 'Use 页加载失败' })
if (!usePage.value)
  throw createError({ statusCode: 404, message: 'Use 页内容不存在' })
useSeoMeta({
  title: () => usePage.value?.title ?? 'Use',
  description: () => usePage.value?.description,
})

const { isScrolled, scrollToTop } = useScrollToTop()
useActionButton({
  id: 'back',
  icon: 'i-lucide-arrow-left',
  label: '返回关于页',
  order: 10,
  async onClick() {
    await navigateTo('/about')
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
  <div>
    <PageHeading :title="usePage?.title ?? 'Use'" />
    <SiteColumns>
      <section class="border-t border-line py-8 lg:px-6">
        <ArticleContent v-if="usePage" :value="usePage" class="mb-8 [&_li>ul]:my-2 [&_h2:first-child]:mt-0 [&_del]:text-muted" />
        <div class="border-t border-line pt-[18px]">
          <NuxtLink to="/about" class="text-link">
            <AppIcon name="left" />返回关于页
          </NuxtLink>
        </div>
      </section>
    </SiteColumns>
  </div>
</template>
