<script setup lang="ts">
import { tocPreviewHeight } from '~/features/toc/model'
import { resolveBackTarget } from '~/shared/navigation'

definePageMeta({
  section: 'posts',
  pageKind: 'detail',
  pageTitle: '文章',
  parentPath: '/posts',
  key: route => route.path,
})
const route = useRoute()
const pagePath = route.path
let path: string
try {
  path = decodeURI(route.path).replace(/\/$/, '')
}
catch {
  throw createError({ statusCode: 404, message: '文章不存在' })
}
const { data: post, error } = await useAsyncData(`post:${path}`, () =>
  queryCollection('posts').path(path).first())
if (error.value)
  throw createError({ statusCode: 500, message: '文章加载失败' })
if (!post.value)
  throw createError({ statusCode: 404, message: '文章不存在' })
const permalink = usePageUrl(() => post.value?.path ?? pagePath)
useArticleTheme(pagePath, () => post.value?.theme)
const links = computed(() => post.value?.body.toc?.links ?? [])
const collapsedRows = 3
const mobileToc = useTemplateRef<HTMLElement>('mobileToc')
const { height: tocHeight } = useElementSize(mobileToc, { width: 0, height: 0 }, { box: 'border-box' })
const { tags } = usePostCatalog()
const articleTitle = useState<{ path: string, title: string } | null>(
  'page:article-title',
  () => null,
)
watchEffect(() => {
  articleTitle.value = { path: pagePath, title: post.value?.title ?? '文章' }
})
onBeforeUnmount(() => {
  if (articleTitle.value?.path === pagePath)
    articleTitle.value = null
})
watch(post, (value) => {
  if (value === null)
    showError({ statusCode: 404, message: '文章不存在' })
})
useHead({ htmlAttrs: {
  class: computed(() => links.value.length ? 'has-article-toc' : ''),
  style: computed(() => ({
    '--toc-preview-height': `${tocPreviewHeight(links.value, collapsedRows)}rem`,
    ...(tocHeight.value > 0 ? { '--toc-height': `${tocHeight.value}px` } : {}),
  })),
} })
useSeoMeta({
  title: () => post.value?.title,
  description: () => post.value?.description,
  ogTitle: () => post.value?.title,
  ogDescription: () => post.value?.description,
  ogType: 'article',
  articlePublishedTime: () => `${post.value?.publish}T00:00:00+08:00`,
  articleModifiedTime: () => `${post.value?.update ?? post.value?.publish}T00:00:00+08:00`,
})

const page = usePageContext()
const previousPath = useState<string | null>('navigation:previous', () => null)
const router = useRouter()
const { isScrolled, scrollToTop } = useScrollToTop()

useActionButton({
  id: 'home',
  icon: 'i-lucide-house',
  label: '返回文章列表',
  order: 10,
  async onClick() {
    await navigateTo('/posts')
  },
})
useActionButton({
  id: 'back',
  icon: 'i-lucide-arrow-left',
  label: '返回上一页',
  order: 30,
  async onClick() {
    if (!import.meta.client)
      return
    const target = resolveBackTarget(previousPath.value, page.value)
    const state: unknown = window.history.state
    if (
      previousPath.value === target
      && state
      && typeof state === 'object'
      && 'back' in state
      && state.back === target
    ) {
      router.back()
    }
    else {
      await navigateTo(target)
    }
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
  <div v-if="post">
    <div
      v-if="links.length"
      ref="mobileToc"
      class="sticky top-[var(--header-height)] z-20 mb-8 bg-acrylic px-5 backdrop-blur-sm -mx-5 lg:hidden md:px-8 md:-mx-8"
    >
      <ContentToc :links="links" :collapsed-rows="collapsedRows" highlight highlight-variant="circuit" />
    </div>
    <SiteColumns sticky>
      <template #sidebar>
        <SiteSidebar :tags="tags">
          <template #after-profile>
            <ContentToc :links="links" highlight highlight-variant="circuit" class="hidden px-2 lg:block" />
          </template>
        </SiteSidebar>
      </template>
      <article class="min-w-0">
        <header class="border-b border-line pb-8">
          <PostMeta :post="post" detailed />
          <h1 class="my-5 break-words text-page text-themed leading-tight">
            {{ post.title }}
          </h1>
          <p v-if="post.summarySource !== 'ai'" class="mb-6 text-muted leading-8">
            {{ post.description }}
          </p>
          <PostTags :tags="post.tags" />
          <ArticleNotices :post="post" :path="pagePath" />
          <img
            v-if="post.cover"
            :src="post.cover"
            alt=""
            width="1200"
            height="675"
            class="mt-7 aspect-video h-auto w-full rounded-panel object-cover"
          >
        </header>
        <ArticleSummary v-if="post.summarySource === 'ai'" :text="post.description" />
        <ArticleContent :value="post" />
        <ArticleLicense
          class="mt-10"
          :title="post.title"
          :permalink="permalink"
          :published-at="post.publish"
        />
        <footer class="mt-12 border-t border-line pt-6">
          <NuxtLink to="/posts" class="text-link">
            <AppIcon name="left" />返回文章列表
          </NuxtLink>
        </footer>
        <ClientOnly><LazyArticleComments :path="post.path" /></ClientOnly>
      </article>
    </SiteColumns>
  </div>
</template>
