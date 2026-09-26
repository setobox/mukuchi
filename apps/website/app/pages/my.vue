<script setup lang="ts">
definePageMeta({ section: 'my', pageKind: 'index', pageTitle: '我的' })
const { items } = useSiteNavigation()
const directory = computed(() => items.value.find(item => item.id === 'my' && item.kind === 'folder'))
useSeoMeta({ title: () => directory.value?.label ?? '我的', description: () => directory.value?.description ?? '浏览我的项目、收藏与工具。' })
usePostListActions()
</script>

<template>
  <div>
    <PageHeading :title="directory?.label ?? '我的'" />
    <SiteColumns>
      <section aria-label="我的目录">
        <p v-if="directory?.description" class="mb-6 text-muted">
          {{ directory.description }}
        </p>
        <SiteDirectory v-if="directory?.children.length" :items="directory.children" />
        <ContentEmptyState v-else title="目录暂时为空" description="这里还没有可浏览的内容。" icon="folder" />
      </section>
    </SiteColumns>
  </div>
</template>
