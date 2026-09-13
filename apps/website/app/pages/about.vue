<script setup lang="ts">
definePageMeta({ section: "about", pageKind: "index", pageTitle: "我的" });
const { site } = useAppConfig();
useSeoMeta({ title: "我的", description: site.owner.description });
</script>

<template>
  <div>
    <PageHeading title="我的" /><SiteColumns
      ><section class="border-t border-line py-8 lg:px-6">
        <p class="mb-4">
          站主：<span class="font-mono text-heading">{{ site.owner.name }}</span>
        </p>
        <p class="mb-4 max-w-140 leading-[2.1]">{{ site.owner.description }}</p>
        <h2 class="my-7 text-section text-heading">关于本站</h2>
        <p class="mb-4 max-w-140 leading-[2.1]">{{ site.description }}</p>
        <div class="flex items-center gap-7 border-t border-line pt-[18px]">
          <NuxtLink to="/posts" class="text-link">浏览文章<AppIcon name="arrow" /></NuxtLink
          ><NuxtLink to="/tools" class="text-link">查看工具<AppIcon name="arrow" /></NuxtLink>
        </div></section
    ></SiteColumns>
  </div>
</template>
