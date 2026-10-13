<script setup lang="ts">
import { resolveBackTarget } from '~/shared/navigation'

definePageMeta({
  section: 'posts',
  pageKind: 'detail',
  pageTitle: '文章',
  parentPath: '/posts',
  key: route => route.path,
})
const route = useRoute()
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
watch(post, (value) => {
  if (value === null)
    showError({ statusCode: 404, message: '文章不存在' })
})
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
</script>

<template>
  <ArticlePage v-if="post" :post="post" :links="post.body.toc?.links ?? []" :content-key="post.id" />
</template>
