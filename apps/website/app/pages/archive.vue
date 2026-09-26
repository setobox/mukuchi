<script setup lang="ts">
definePageMeta({ section: 'archive', pageKind: 'index', pageTitle: '归档' })
const { data, status, error, refresh } = usePostCatalog()
useSeoMeta({ title: '归档', description: '沿时间线浏览全部文章，按年份展开阅读。' })
usePostListActions()
</script>

<template>
  <div>
    <PageHeading title="归档" />
    <SiteColumns>
      <CatalogStatus label="文章" :pending="status === 'pending' && !data" :failed="!!error" :empty="!data?.length" icon="clock" @retry="refresh()">
        <ArchiveTimeline :posts="data ?? []" />
      </CatalogStatus>
    </SiteColumns>
  </div>
</template>
