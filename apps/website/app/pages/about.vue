<script setup lang="ts">
definePageMeta({ section: "about", pageKind: "index", pageTitle: "关于" });
const { site } = useAppConfig();
const { data: about, error } = await useAsyncData("page:about", () =>
  queryCollection("about").path("/about").first(),
);
if (error.value) throw createError({ statusCode: 500, message: "关于页加载失败" });
if (!about.value) throw createError({ statusCode: 404, message: "关于页内容不存在" });
useSeoMeta({
  title: () => about.value?.title ?? "关于",
  description: () => about.value?.description ?? site.owner.description,
});

const { isScrolled, scrollToTop } = useScrollToTop();
useActionButton({
  id: "home",
  icon: "i-lucide-house",
  label: "返回文章列表",
  order: 10,
  async onClick() {
    await navigateTo("/posts");
  },
});
useActionButton({
  id: "top",
  icon: "i-lucide-chevron-up",
  label: "回到页面顶部",
  order: 40,
  visible: isScrolled,
  onClick: scrollToTop,
});
</script>

<template>
  <div>
    <PageHeading :title="about?.title ?? '关于'" /><SiteColumns
      ><section class="border-t border-line py-8 lg:px-6">
        <p class="mb-4">
          站长：<span class="text-heading font-mono">{{ site.owner.name }}</span>
        </p>
        <p class="mb-4 max-w-140 leading-[2.1]">{{ site.owner.description }}</p>
        <ArticleContent v-if="about" :value="about" class="mb-8" />
        <div class="flex items-center gap-7 border-t border-line pt-[18px]">
          <NuxtLink to="/posts" class="text-link">浏览文章<AppIcon name="arrow" /></NuxtLink
          ><NuxtLink to="/tools" class="text-link">查看工具<AppIcon name="arrow" /></NuxtLink>
        </div></section
    ></SiteColumns>
  </div>
</template>
