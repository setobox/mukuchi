<script setup lang="ts">
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { aiTypeLabels, aiTypes } from '#shared/admin/articles'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'AI 设置' })
const route = useRoute()
const router = useRouter()
const settingsTabs = [...aiTypes, 'assistant'] as const
const settingsLabels = { ...aiTypeLabels, assistant: '对话助手' }
const tab = computed<(typeof settingsTabs)[number]>({
  get: () => settingsTabs.find(value => value === route.query.tab) ?? 'summary',
  set: (value) => { void router.replace({ query: { ...route.query, tab: value } }) },
})
const audioTab = computed(() => tab.value === 'podcast' ? 'podcast' : 'narration')
const view = computed<'config' | 'tasks'>({
  get: () => route.query.view === 'tasks' || (route.query.view !== 'config' && typeof route.query.article === 'string') ? 'tasks' : 'config',
  set: (value) => { void router.replace({ query: { ...route.query, view: value } }) },
})
</script>

<template>
  <div>
    <h1 class="text-page text-heading">
      AI 设置
    </h1>
    <p class="mb-7 mt-2 text-muted">
      配置 AI 服务，查看生成任务和运行记录。
    </p>
    <TabsRoot v-model="tab">
      <TabsList aria-label="AI 服务类型" class="grid grid-cols-2 mb-3 gap-2 border-b border-line pb-3 md:flex">
        <TabsTrigger v-for="kind in settingsTabs" :key="kind" :value="kind" class="control-base control-quiet shrink-0 whitespace-nowrap px-4 data-[state=active]:bg-accent-surface data-[state=active]:text-accent-soft">
          {{ settingsLabels[kind] }}
        </TabsTrigger>
      </TabsList>
      <TabsContent v-show="tab === 'summary'" value="summary" force-mount>
        <SummarySettings v-model:view="view" :active="tab === 'summary'" />
      </TabsContent>
      <TabsContent v-show="tab === 'narration' || tab === 'podcast'" :value="audioTab" force-mount>
        <AudioSettings v-model:view="view" :kind="audioTab" :active="tab === 'narration' || tab === 'podcast'" />
      </TabsContent>
      <TabsContent v-show="tab === 'assistant'" value="assistant" force-mount>
        <AssistantSettings v-model:view="view" :active="tab === 'assistant'" />
      </TabsContent>
    </TabsRoot>
  </div>
</template>
