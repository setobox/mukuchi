<script setup lang="ts">
import type { TaxonomyKind } from '#shared/content/taxonomy'
import { computed } from 'vue'

const props = defineProps<{ kind: TaxonomyKind }>()
const { data, categories, tags, status, error, refresh } = usePostCatalog()
const label = computed(() => props.kind === 'category' ? '分类' : '标签')
const terms = computed(() => props.kind === 'category' ? categories.value : tags.value)
useSeoMeta({ title: label, description: () => `浏览全部${label.value}及文章数量，找到感兴趣的内容。` })
usePostListActions()
</script>

<template>
  <div>
    <PageHeading :title="label" />
    <SiteColumns>
      <CatalogStatus :label="label" :pending="status === 'pending' && !data" :failed="!!error" :empty="!terms.length" :icon="kind === 'category' ? 'folder' : 'tags'" @retry="refresh()">
        <TaxonomyDirectory :kind="kind" :terms="terms" />
      </CatalogStatus>
    </SiteColumns>
  </div>
</template>
