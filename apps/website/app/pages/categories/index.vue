<script setup lang="ts">
definePageMeta({ section: "categories", pageKind: "index", pageTitle: "专栏" });
const route = useRoute();
const { categories } = usePostCatalog();
const selected = computed(() =>
  typeof route.query.category === "string" ? route.query.category.trim() : "",
);
const tag = computed(() => (typeof route.query.tag === "string" ? route.query.tag.trim() : ""));
useSeoMeta({ title: () => selected.value || "专栏", description: "按专栏分类浏览文章。" });
</script>

<template>
  <div>
    <PageHeading :title="selected || '专栏'" />
    <PostCollection :category="selected">
      <template #toolbar-start>
        <CategoryNavigation :categories="categories" :selected="selected" :tag="tag" />
      </template>
    </PostCollection>
  </div>
</template>
