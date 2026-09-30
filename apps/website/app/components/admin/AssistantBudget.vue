<script setup lang="ts">
import type { AssistantUsage } from '#shared/assistant/budget'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { assistantUsageSchema } from '#shared/assistant/budget'

const props = defineProps<{ refreshKey: number }>()
const emit = defineEmits<{ editLimit: [] }>()
const { current, request } = useAdminSession()
const usage = ref<AssistantUsage | null>(null)
const preview = ref<AssistantUsage | null>(null)
const busy = ref(false)
const error = ref('')
const message = ref('')
const visibility = useDocumentVisibility()
const occupied = computed(() => usage.value ? usage.value.spentMicros + usage.value.reservedMicros : 0)
const percent = computed(() => usage.value ? Math.floor(occupied.value / usage.value.limitMicros * 1000) / 10 : 0)
const exhausted = computed(() => usage.value && occupied.value >= usage.value.limitMicros)
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 6 })
const money = (micros: number) => currency.format(micros / 1_000_000)

async function refresh(clearError = true) {
  if (busy.value || current.value.user?.role !== 'admin')
    return
  busy.value = true
  if (clearError)
    error.value = ''
  try {
    usage.value = assistantUsageSchema.parse(await request<unknown>('assistant/usage'))
  }
  catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
}
async function reset() {
  const snapshot = preview.value
  if (!snapshot || busy.value)
    return
  busy.value = true
  error.value = message.value = ''
  try {
    usage.value = assistantUsageSchema.parse(await request<unknown>('assistant/usage/reset', { method: 'POST', body: { day: snapshot.day, resetMicros: snapshot.resetMicros } }))
    message.value = '今日已结算额度已重置，处理中预留额度已保留。'
  }
  catch (cause) { error.value = adminError(cause) }
  finally {
    preview.value = null
    busy.value = false
    if (error.value)
      await refresh(false)
  }
}
watch([() => current.value.user?.role, () => props.refreshKey], () => refresh(), { immediate: true })
useIntervalFn(() => {
  if (visibility.value === 'visible')
    void refresh()
}, 30_000)
watch(visibility, value => value === 'visible' && refresh())
</script>

<template>
  <section class="sm:p-5 mb-6 border border-line rounded-panel bg-surface p-4" aria-label="助手每日额度">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm text-heading font-semibold">
        今日已占额度
      </h3>
      <BaseButton type="button" variant="ghost" :disabled="busy" @click="refresh()">
        刷新额度
      </BaseButton>
    </div>
    <p v-if="error" role="alert" class="mt-2 text-sm text-error">
      {{ error }}
    </p>
    <template v-if="usage">
      <div class="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-lg text-heading tabular-nums">
          {{ money(occupied) }} <span class="text-sm text-muted">/ {{ money(usage.limitMicros) }}</span>
        </p>
        <span class="text-sm tabular-nums" :class="exhausted ? 'text-error' : 'text-muted'">{{ percent }}%</span>
      </div>
      <progress :value="Math.min(occupied, usage.limitMicros)" :max="usage.limitMicros" class="budget-progress my-3 block h-2 w-full" :class="exhausted ? 'text-error' : 'text-accent'" aria-label="今日已占额度" :aria-valuetext="`${money(occupied)} / ${money(usage.limitMicros)}`" />
      <p class="text-xs text-muted leading-6">
        已结算 {{ money(usage.spentMicros) }} · 处理中预留 {{ money(usage.reservedMicros) }} · {{ usage.day }}（上海时区）
      </p>
      <p v-if="exhausted" role="status" class="mt-3 text-sm text-error">
        今日额度已达上限，请前往调整额度上限，或重置今日额度后继续使用。
      </p>
      <p v-if="usage.resetMicros" class="mt-1 text-xs text-muted">
        今日累计结算 {{ money(usage.totalSpentMicros) }}，已重置 {{ money(usage.resetMicros) }}。
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <BaseButton type="button" variant="border" @click="emit('editLimit')">
          调整额度上限
        </BaseButton>
        <BaseButton type="button" variant="ghost" :disabled="busy || !usage.spentMicros" @click="preview = { ...usage }">
          重置今日额度
        </BaseButton>
      </div>
      <div v-if="preview" class="mt-4 border-t border-line pt-4" role="group" aria-label="确认重置今日额度">
        <p class="text-sm leading-6">
          确认重置今日已结算额度？处理中预留额度会保留，供应商已产生的费用不会清零。
        </p>
        <div class="mt-3 flex gap-2">
          <BaseButton type="button" :loading="busy" @click="reset">
            确认重置
          </BaseButton>
          <BaseButton type="button" variant="ghost" :disabled="busy" @click="preview = null">
            取消
          </BaseButton>
        </div>
      </div>
      <p v-if="message" role="status" class="mt-3 text-sm text-muted">
        {{ message }}
      </p>
    </template>
    <p v-else-if="!error" role="status" class="mt-3 text-sm text-muted">
      正在读取今日额度…
    </p>
  </section>
</template>

<style scoped>
.budget-progress {
  appearance: none;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: var(--color-border-strong);
}

.budget-progress::-webkit-progress-bar {
  border-radius: inherit;
  background: var(--color-border-strong);
}

.budget-progress::-webkit-progress-value {
  border-radius: inherit;
  background: currentColor;
}

.budget-progress::-moz-progress-bar {
  border-radius: inherit;
  background: currentColor;
}
</style>
