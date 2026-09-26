<script setup lang="ts">
import type { IconName } from '~/shared/icons'

defineProps<{ label: string, pending: boolean, failed: boolean, empty: boolean, icon: IconName }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="failed" class="py-12" role="alert">
    <p>{{ label }}加载失败，请重试。</p>
    <BaseButton class="mt-4" variant="border" @click="$emit('retry')">
      重新加载
    </BaseButton>
  </div>
  <p v-else-if="pending" class="py-12 text-muted" role="status">
    正在加载{{ label }}
  </p>
  <ContentEmptyState v-else-if="empty" :title="`暂无${label}`" :icon="icon" />
  <slot v-else />
</template>
