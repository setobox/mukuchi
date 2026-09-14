<script setup lang="ts">
definePageMeta({ section: "categories", pageKind: "index", pageTitle: "专栏" });
const route = useRoute();
const { categories } = usePostCatalog();
const selected = computed(() =>
  typeof route.query.category === "string" ? route.query.category.trim() : "",
);
const tag = computed(() => (typeof route.query.tag === "string" ? route.query.tag.trim() : ""));
useSeoMeta({ title: () => selected.value || "专栏", description: "按专栏分类浏览文章。" });

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
    <PageHeading :title="selected || '专栏'" />
    <PostCollection :category="selected">
      <template #toolbar-start>
        <CategoryNavigation :categories="categories" :selected="selected" :tag="tag" />
      </template>
    </PostCollection>
  </div>
</template>
