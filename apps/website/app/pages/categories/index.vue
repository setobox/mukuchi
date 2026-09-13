<script setup lang="ts">
definePageMeta({ section: "categories", pageKind: "index", pageTitle: "专栏" });
useSeoMeta({ title: "专栏", description: "按专栏分类浏览文章。" });
</script>

<template>
  <div>
    <PageHeading title="专栏" />
    <nav
      class="-mx-1 -mt-3 mb-7 min-h-13 min-w-0 flex flex-nowrap items-center gap-2.5 p-1"
      aria-label="专栏分类"
    >
      <NuxtLink
        to="/categories"
        aria-current="page"
        class="min-h-11 inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-category-active bg-category-active px-[18px] py-2 font-semibold leading-normal text-category-active-ink [transition-property:background,border-color,color] duration-160 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-category-active)_90%,white)]"
        ><AppIcon name="notebook" />全部文章</NuxtLink
      >
    </nav>
    <SiteColumns> <ContentEmptyState title="暂无专栏文章" icon="folder" /></SiteColumns>
  </div>
</template>
