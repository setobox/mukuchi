<script setup lang="ts">
import { useArticleToc } from "~/features/toc/useArticleToc";
definePageMeta({
  section: "posts",
  pageKind: "detail",
  pageTitle: "文章",
  parentPath: "/posts",
  key: (route) => route.path,
});
const route = useRoute();
const pagePath = route.path;
let path: string;
try {
  path = decodeURI(route.path).replace(/\/$/, "");
} catch {
  throw createError({ statusCode: 404, message: "文章不存在" });
}
const { data: post, error } = await useAsyncData(`post:${path}`, () =>
  queryCollection("posts").path(path).first(),
);
if (error.value) throw createError({ statusCode: 500, message: "文章加载失败" });
if (!post.value) throw createError({ statusCode: 404, message: "文章不存在" });
const root = useTemplateRef<HTMLElement>("articleRoot");
const links = computed(() => post.value?.body.toc?.links ?? []);
const { items, activeId, currentTitle } = useArticleToc(links, root);
const { tags } = usePostCatalog();
const articleTitle = useState<{ path: string; title: string } | null>(
  "page:article-title",
  () => null,
);
watchEffect(() => {
  articleTitle.value = { path: pagePath, title: post.value?.title ?? "文章" };
});
onBeforeUnmount(() => {
  if (articleTitle.value?.path === pagePath) articleTitle.value = null;
});
watch(post, (value) => {
  if (value === null) showError({ statusCode: 404, message: "文章不存在" });
});
useHead({ htmlAttrs: { class: computed(() => (items.value.length ? "has-article-toc" : "")) } });
useSeoMeta({
  title: () => post.value?.title,
  description: () => post.value?.description,
  ogTitle: () => post.value?.title,
  ogDescription: () => post.value?.description,
  ogType: "article",
  articlePublishedTime: () => `${post.value?.publish}T00:00:00+08:00`,
  articleModifiedTime: () => `${post.value?.update ?? post.value?.publish}T00:00:00+08:00`,
});
</script>
<template>
  <div v-if="post" :class="{ 'pt-11 lg:pt-0': items.length }">
    <ArticleToc mobile :items="items" :active-id="activeId" :current-title="currentTitle" />
    <SiteColumns sticky>
      <template #sidebar>
        <SiteSidebar :tags="tags">
          <template #after-profile
            ><ArticleToc :items="items" :active-id="activeId" :current-title="currentTitle"
          /></template>
        </SiteSidebar>
      </template>
      <article ref="articleRoot" class="min-w-0">
        <header class="border-b border-line pb-8">
          <PostMeta :post="post" detailed />
          <h1 class="my-5 break-words text-page text-heading leading-tight">{{ post.title }}</h1>
          <p class="mb-6 text-muted leading-8">{{ post.description }}</p>
          <PostTags :tags="post.tags" />
          <img
            v-if="post.cover"
            :src="post.cover"
            alt=""
            width="1200"
            height="675"
            class="mt-7 aspect-video h-auto w-full rounded-panel object-cover"
          />
        </header>
        <ArticleContent :value="post" />
        <footer class="mt-12 border-t border-line pt-6">
          <NuxtLink to="/posts" class="text-link"><AppIcon name="left" />返回文章列表</NuxtLink>
        </footer>
      </article>
    </SiteColumns>
  </div>
</template>
