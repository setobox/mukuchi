<script setup lang="ts">
definePageMeta({ section: 'series', pageKind: 'index', pageTitle: '系列' })
const { series, data, status, error, refresh } = usePostCatalog()
useSeoMeta({ title: '系列', description: '按主题与篇目顺序，展开系列目录，连贯阅读相关文章。' })
usePostListActions()
</script>

<template>
  <div>
    <PageHeading title="系列" />
    <SiteColumns>
      <CatalogStatus label="系列" :pending="status === 'pending' && !data" :failed="!!error" :empty="!series.length" icon="list" @retry="refresh()">
        <SeriesDirectory :groups="series" />
      </CatalogStatus>
    </SiteColumns>
  </div>
</template>
