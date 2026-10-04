<script setup lang="ts">
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

defineProps<{
  title: string
  loaded: boolean
  dirty: boolean
  saving?: boolean
  testing?: boolean
  locked?: boolean
  testLabel?: string
  testDisabled?: boolean
  status?: string
  hint?: string
}>()
defineEmits<{ save: [], test: [] }>()
const enabled = defineModel<boolean>('enabled', { required: true })
const view = defineModel<'config' | 'tasks'>('view', { default: 'config' })
</script>

<template>
  <TabsRoot v-model="view" :aria-label="`${title}设置与任务`">
    <div class="sticky top-17 z-20 mb-6 border-b border-line bg-canvas pb-3 pt-3">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 class="mr-auto text-title text-heading font-semibold">
          {{ title }}
        </h2>
        <BaseSwitch v-model="enabled" label="启用" :aria-label="`启用${title}`" :disabled="!loaded || saving || testing || locked" />
        <div class="w-full flex items-center justify-end gap-2 md:w-auto">
          <BaseButton :disabled="!loaded || !dirty || testing || locked" :loading="saving" @click="$emit('save')">
            {{ saving ? '保存中…' : '保存设置' }}
          </BaseButton>
          <BaseButton v-if="testLabel" variant="border" :disabled="!loaded || saving || locked || testDisabled" :loading="testing" @click="$emit('test')">
            {{ testing ? '测试中…' : dirty ? '保存并测试' : testLabel }}
          </BaseButton>
        </div>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" role="status">
        <span :class="dirty && !saving && !testing ? 'text-warn' : ''">{{ !loaded ? '正在读取设置…' : saving ? '正在保存' : testing ? '测试中' : dirty ? '有未保存修改' : '已保存' }}</span>
        <span v-if="status">{{ status }}</span>
        <span v-if="hint" class="text-warn">{{ hint }}</span>
      </div>
      <TabsList :aria-label="`${title}视图`" class="mt-4 inline-flex gap-1 rounded-button bg-surface p-1">
        <TabsTrigger v-for="item in [{ value: 'config', label: '配置', icon: 'i-lucide-settings-2' }, { value: 'tasks', label: '任务', icon: 'i-lucide-list-checks' }]" :key="item.value" :value="item.value" class="control-quiet min-h-11 flex items-center gap-2 px-4 text-sm data-[state=active]:bg-accent-surface data-[state=active]:text-accent-soft">
          <span :class="item.icon" aria-hidden="true" />{{ item.label }}
        </TabsTrigger>
      </TabsList>
    </div>
    <slot name="feedback" />
    <TabsContent v-show="view === 'config'" value="config" force-mount>
      <slot name="config" />
    </TabsContent>
    <TabsContent v-show="view === 'tasks'" value="tasks" force-mount>
      <slot name="tasks" />
    </TabsContent>
  </TabsRoot>
</template>
