<script setup lang="ts">
withDefaults(
  defineProps<{
    tags?: { name: string, count: number }[]
    selectedTag?: string
  }>(),
  { selectedTag: '' },
)
</script>

<template>
  <div class="flex flex-col gap-6">
    <SiteProfileCard />
    <slot name="after-profile" />
    <section v-if="tags" class="hidden px-2 lg:block" aria-labelledby="sidebar-tags">
      <h2 id="sidebar-tags" class="section-label">
        标签
      </h2>
      <TagFilter
        v-if="tags.length"
        :tags="tags"
        :selected="selectedTag"
        class="mt-3.5"
      />
      <p v-else class="mt-3.5 text-muted">
        暂无标签
      </p>
    </section>
    <SiteStats />
  </div>
</template>
