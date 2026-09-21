<script setup lang="ts">
import type { AiState, AiType } from '#shared/admin/articles'
import { aiStatusLabels, aiStatusTone, aiTypeLabels } from '#shared/admin/articles'

defineProps<{ kind: AiType, state: AiState, path: string, changed?: boolean }>()
</script>

<template>
  <BaseTooltip :text="[state.message, kind !== 'summary' ? '音频基于已上线版本。' : '', changed && kind !== 'summary' ? '编辑稿正文已变化，更新上线后将生成新音频。' : ''].filter(Boolean).join(' ') || '打开对应 AI 管理列表'">
    <NuxtLink :to="{ path: '/admin/ai', query: { tab: kind, article: path } }" class="ui-link min-h-11 inline-flex items-center text-xs">
      <BaseTag :tone="aiStatusTone(state.status)">
        <span v-if="state.status === 'running' || state.status === 'queued'" class="i-lucide-loader-circle animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {{ aiTypeLabels[kind] }} · {{ aiStatusLabels[state.status] }}
      </BaseTag>
    </NuxtLink>
  </BaseTooltip>
</template>
