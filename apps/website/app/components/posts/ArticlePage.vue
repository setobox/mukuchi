<script setup lang="ts">
import type { PageCollectionItemBase } from '@nuxt/content'
import type { MDCRoot } from '@nuxtjs/mdc'
import type { PreviewHeading } from '#shared/admin/preview'
import type { PostMeta } from '#shared/content/schema'
import { tocPreviewHeight } from '~/features/toc/model'

const props = defineProps<{ post: PostMeta & { path: string, body: PageCollectionItemBase['body'] | MDCRoot }, links: PreviewHeading[], contentKey: string }>()
const pagePath = useRoute().path
const permalink = usePageUrl(() => props.post?.path ?? pagePath)
useArticleTheme(pagePath, () => props.post?.theme)
const links = computed(() => props.links)
const collapsedRows = 3
const mobileToc = useTemplateRef<HTMLElement>('mobileToc')
const { height: tocHeight } = useElementSize(mobileToc, { width: 0, height: 0 }, { box: 'border-box' })
const { tags } = usePostCatalog()
const articleTitle = useState<{ path: string, title: string } | null>(
  'page:article-title',
  () => null,
)
watchEffect(() => {
  articleTitle.value = { path: pagePath, title: props.post?.title ?? '文章' }
})
onBeforeUnmount(() => {
  if (articleTitle.value?.path === pagePath)
    articleTitle.value = null
})
useHead({ htmlAttrs: {
  class: computed(() => links.value.length ? 'has-article-toc' : ''),
  style: computed(() => ({
    '--toc-preview-height': `${tocPreviewHeight(links.value, collapsedRows)}rem`,
    ...(tocHeight.value > 0 ? { '--toc-height': `${tocHeight.value}px` } : {}),
  })),
} })

const { isScrolled, scrollToTop } = useScrollToTop()
useActionButton({ id: 'top', icon: 'i-lucide-chevron-up', label: '回到页面顶部', order: 40, visible: isScrolled, onClick: scrollToTop })
</script>

<template>
  <div>
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
        <ArticleHeader :post="post" />
        <ClientOnly><ArticleAudio :path="post.path" /></ClientOnly>
        <ArticleSeries v-if="post.series" :name="post.series" :current-path="post.path" />
        <ArticleSummary :text="post.description" />
        <ArticleBody :content-key="contentKey">
          <ContentRenderer :value="post" />
        </ArticleBody>
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
