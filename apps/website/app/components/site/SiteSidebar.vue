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
    <section class="hidden px-2 lg:block" aria-labelledby="sidebar-stats">
      <h2 id="sidebar-stats" class="section-label">
        网站统计
      </h2>
      <dl class="grid grid-cols-3 mb-0 mt-5">
        <div
          v-for="(label, index) in ['文章', '标签', '专栏']"
          :key="label"
          :class="{ 'border-l border-line pl-4': index > 0 }"
        >
          <dt class="text-muted">
            {{ label }}
          </dt>
          <dd
            class="m-0 mt-1.5 text-[18px] text-ink leading-[normal] font-mono"
            aria-label="暂无数据"
          >
            —
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>
