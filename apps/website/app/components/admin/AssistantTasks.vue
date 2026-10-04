<script setup lang="ts">
import type { AssistantTaskDetail } from '#shared/assistant/tasks'
import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { taskDetailSchema, taskListSchema, taskStatusLabels } from '#shared/assistant/tasks'

const props = withDefaults(defineProps<{ active?: boolean, focusId?: string, revision: number }>(), { active: true })
const { current, request } = useAdminSession()
const visibility = useDocumentVisibility()
const kind = ref('')
const status = ref('')
const page = ref(1)
const data = ref(taskListSchema.parse({ tasks: [], total: 0, page: 1, pageSize: 20 }))
const selected = ref('')
const detail = ref<AssistantTaskDetail | null>(null)
const error = ref('')
const loading = ref(false)
const loaded = ref(false)
const clock = ref(Date.now())
let sequence = 0
let disposed = false
const pages = computed(() => Math.max(1, Math.ceil(data.value.total / data.value.pageSize)))
async function refresh() {
  if (disposed || !props.active || visibility.value === 'hidden' || current.value.user?.role !== 'admin' || loading.value)
    return
  const token = ++sequence
  loading.value = true
  try {
    const query = new URLSearchParams({ page: String(page.value), pageSize: '20', ...(kind.value ? { kind: kind.value } : {}), ...(status.value ? { status: status.value } : {}) })
    const result = taskListSchema.parse(await request(`assistant/tasks?${query}`))
    if (disposed || token !== sequence)
      return
    data.value = result
    loaded.value = true
    if (page.value > pages.value) {
      page.value = pages.value
      return
    }
    if (selected.value && (result.tasks.some(task => task.id === selected.value) || detail.value?.id === selected.value)) {
      const entry = taskDetailSchema.parse(await request(`assistant/tasks/${selected.value}`))
      if (!disposed && token === sequence)
        detail.value = entry
    }
    error.value = ''
  }
  catch (cause) {
    if (!disposed && token === sequence)
      error.value = adminError(cause)
  }
  finally {
    if (token === sequence)
      loading.value = false
  }
}
function reload() {
  sequence++
  loading.value = false
  void refresh()
}
watch([kind, status], () => {
  page.value = 1
  reload()
})
watch(page, reload)
watch(() => props.revision, reload)
watch(() => props.focusId, (id) => {
  if (!id)
    return
  kind.value = status.value = ''
  page.value = 1
  selected.value = id
  detail.value = null
  reload()
}, { immediate: true })
watch([visibility, () => props.active], ([value, active]) => {
  if (value === 'visible' && active) {
    reload()
  }
  else {
    sequence++
    loading.value = false
  }
})
watch(() => current.value.user?.role, (role) => {
  if (role !== 'admin') {
    data.value.tasks = []
    detail.value = null
    sequence++
  }
  else {
    reload()
  }
}, { immediate: true })
useIntervalFn(() => {
  clock.value = Date.now()
  void refresh()
}, 2000)
onBeforeUnmount(() => {
  disposed = true
  sequence++
})
function select(id: string) {
  selected.value = selected.value === id ? '' : id
  detail.value = null
  reload()
}
const time = (value: number) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
const duration = (start: number, end: number | null) => `${Math.max(0, ((end ?? clock.value) - start) / 1000).toFixed(1)}s`
const phases = computed(() => {
  const task = detail.value
  if (!task)
    return []
  const stages = ['task', 'review', 'reply', 'done'] as const
  const current = stages.indexOf(task.stage)
  return stages.map((stage, index) => {
    const steps = task.steps.filter(step => step.stage === stage)
    const start = steps.length ? Math.min(...steps.map(step => step.startedAt)) : stage === 'task' ? task.createdAt : stage === 'done' && task.status === 'completed' ? task.finishedAt : null
    const nextStarts = task.steps.filter(step => stages.indexOf(step.stage) > index).map(step => step.startedAt)
    const end = stage === 'done' ? task.finishedAt : nextStarts.length ? Math.min(...nextStarts) : task.finishedAt
    const state = index < current ? 'completed' : index > current ? 'pending' : task.status === 'waiting' ? 'running' : task.status
    return { stage, label: stage === 'task' ? task.kind === 'test' ? '测试任务' : '对话任务' : stage === 'review' ? '正在审核' : stage === 'reply' ? '正在回复' : '完成', start, end, state, weight: start === null ? 1 : Math.max(1, ((end ?? clock.value) - start) / 1000) }
  })
})
</script>

<template>
  <section aria-label="助手任务监控">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-title text-heading font-semibold">
        任务进度与历史
      </h2>
      <BaseButton variant="border" :disabled="loading" @click="reload">
        刷新
      </BaseButton>
    </div>
    <p class="mb-5 text-xs text-muted">
      保存最近 30 天的任务状态与诊断，不保存聊天正文。时间为北京时间，可见页面每 2 秒刷新。
    </p>
    <div class="mb-5 flex flex-wrap gap-3">
      <BaseSelect v-model="kind" aria-label="任务类型" class="w-40" :options="[{ value: '', label: '全部任务' }, { value: 'conversation', label: '对话任务' }, { value: 'test', label: '测试任务' }]" />
      <BaseSelect v-model="status" aria-label="任务状态" class="w-40" :options="[{ value: '', label: '全部状态' }, ...Object.entries(taskStatusLabels).map(([value, label]) => ({ value, label }))]" />
    </div>
    <p v-if="error" role="alert" class="mb-4 text-error">
      {{ error }}
    </p>
    <AdminSkeleton v-if="!loaded && !error" />
    <p v-else-if="!data.tasks.length" class="py-6 text-muted">
      暂无任务记录。
    </p>
    <div v-for="task in data.tasks" :key="task.id" class="mb-3 border border-line rounded-panel">
      <button type="button" class="control-quiet w-full flex flex-wrap items-center gap-3 p-4 text-left text-sm" :aria-expanded="selected === task.id" @click="select(task.id)">
        <span class="font-medium">{{ task.kind === 'test' ? '测试任务' : '对话任务' }}</span>
        <span class="text-xs text-muted">{{ time(task.createdAt) }}</span>
        <span class="ml-auto" :class="task.status === 'failed' ? 'text-error' : task.status === 'completed' ? 'text-success' : 'text-muted'">{{ taskStatusLabels[task.status] }}</span>
        <span class="text-xs text-muted tabular-nums">{{ duration(task.createdAt, task.finishedAt) }}</span>
        <span class="i-lucide-chevron-down" />
      </button>
      <div v-if="selected === task.id && detail?.id === task.id" class="border-t border-line p-4">
        <div class="overflow-x-auto pb-3">
          <ol class="m-0 min-w-[650px] flex list-none gap-1 p-0" aria-label="任务阶段">
            <li v-for="phase in phases" :key="phase.stage" class="min-w-30" :style="{ flexGrow: phase.weight, flexBasis: '120px' }" :aria-current="phase.state === 'running' ? 'step' : undefined">
              <div class="mb-1 text-xs text-muted">
                {{ phase.label }}
              </div>
              <div class="h-8 flex items-center justify-end gap-2 border rounded px-2 text-xs tabular-nums" :class="phase.state === 'failed' ? 'border-error text-error' : phase.state === 'completed' ? 'border-line text-success' : phase.state === 'running' ? 'border-accent text-accent-soft' : 'border-line text-muted'">
                <span>{{ phase.start === null ? '—' : duration(phase.start, phase.end) }}</span>
                <span :class="phase.state === 'completed' ? 'i-lucide-circle-check' : phase.state === 'failed' ? 'i-lucide-circle-x' : phase.state === 'running' ? 'i-lucide-loader-circle animate-spin motion-reduce:animate-none' : 'i-lucide-circle'" />
              </div>
              <div class="mt-1 whitespace-nowrap text-[10px] text-muted">
                {{ phase.start === null ? '尚未开始' : time(phase.start) }}
              </div>
            </li>
          </ol>
        </div>
        <p class="mt-2 break-all text-xs text-muted">
          任务 {{ detail.id }} · 配置版本 {{ detail.configVersion }} · 模型 {{ detail.modelCalls }} 次 · 工具 {{ detail.toolCalls }} 次 · 历史 {{ detail.historyCalls }} 次
        </p>
        <p v-if="detail.status === 'waiting'" role="status" class="mt-3 text-sm text-muted">
          正在等待浏览器提供较早的会话历史。
        </p>
        <div v-if="detail.error" role="alert" class="mt-4 border border-error rounded p-4 text-sm text-error">
          <p>{{ detail.error.message }}</p>
          <p class="mt-2 break-all text-xs">
            错误码：{{ detail.error.code }}<span v-if="detail.error.status"> · HTTP {{ detail.error.status }}</span><span v-if="detail.error.upstreamStatus"> · 上游 HTTP {{ detail.error.upstreamStatus }}</span><span v-if="detail.error.upstreamCode"> · 上游错误 {{ detail.error.upstreamCode }}</span><span v-if="detail.error.requestId"> · 上游请求 {{ detail.error.requestId }}</span>
          </p>
        </div>
        <ol class="mt-4 list-none p-0 text-xs text-muted space-y-2" aria-label="执行步骤">
          <li v-for="step in detail.steps" :key="step.id" class="flex flex-wrap gap-x-4 gap-y-1" :class="step.status === 'failed' ? 'text-error' : ''">
            <span>{{ step.label }}</span><span>{{ taskStatusLabels[step.status] }}</span><span>{{ duration(step.startedAt, step.finishedAt) }}</span><span>{{ time(step.startedAt) }}</span>
            <span v-if="step.error" class="w-full break-words">{{ step.error.code }} · {{ step.error.message }}</span>
          </li>
        </ol>
      </div>
    </div>
    <div v-if="data.total" class="mt-5 flex items-center justify-end gap-4 text-xs text-muted">
      <span>共 {{ data.total }} 条 · {{ page }} / {{ pages }} 页</span><BaseButton variant="border" :disabled="page === 1" @click="page--">
        上一页
      </BaseButton><BaseButton variant="border" :disabled="page >= pages" @click="page++">
        下一页
      </BaseButton>
    </div>
  </section>
</template>
