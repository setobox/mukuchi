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
    <section v-if="tags" class="hidden border border-line rounded-panel bg-surface p-4 lg:block" aria-labelledby="sidebar-tags">
      <h2 id="sidebar-tags" class="flex items-center gap-2.5 text-base text-heading font-semibold leading-6">
        <span class="h-4 w-0.75 shrink-0 rounded-sm bg-accent" aria-hidden="true" />
        标签
      </h2>
      <TagFilter
        v-if="tags.length"
        :tags="tags"
        :selected="selectedTag"
        class="mt-3"
      />
      <p v-else class="mt-3 text-muted">
        暂无标签
      </p>
    </section>
    <SiteStats />
  </div>
</template>
