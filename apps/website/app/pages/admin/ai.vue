<script setup lang="ts">
import type { AiType } from '#shared/admin/articles'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { aiTypeLabels, aiTypes } from '#shared/admin/articles'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'AI 设置' })
const route = useRoute()
const router = useRouter()
const tab = computed<AiType>({
  get: () => aiTypes.find(value => value === route.query.tab) ?? 'summary',
  set: (value) => { void router.replace({ query: { ...route.query, tab: value } }) },
})
const audioTab = computed(() => tab.value === 'podcast' ? 'podcast' : 'narration')
const summaryRevision = ref(0)
const summaryBusy = ref(false)
</script>

<template>
  <div>
    <h1 class="text-page text-heading">
      AI 设置
    </h1>
    <p class="mb-7 mt-2 text-muted">
      配置生成服务，管理每篇文章的摘要与音频。
    </p>
    <TabsRoot v-model="tab">
      <TabsList aria-label="AI 服务类型" class="mb-8 flex gap-2 border-b border-line pb-3">
        <TabsTrigger v-for="kind in aiTypes" :key="kind" :value="kind" class="control-base control-quiet px-4 data-[state=active]:bg-accent-surface data-[state=active]:text-accent-soft">
          {{ aiTypeLabels[kind] }}
        </TabsTrigger>
      </TabsList>
      <TabsContent v-show="tab === 'summary'" value="summary" force-mount>
        <SummarySettings :locked="summaryBusy" @saved="summaryRevision++" />
        <SummaryManager :revision="summaryRevision" @busy="summaryBusy = $event" />
      </TabsContent>
      <TabsContent v-show="tab !== 'summary'" :value="audioTab" force-mount>
        <AudioSettings :kind="audioTab" :active="tab !== 'summary'" />
      </TabsContent>
    </TabsRoot>
  </div>
</template>
