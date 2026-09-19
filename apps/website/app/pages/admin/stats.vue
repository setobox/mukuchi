<script setup lang="ts">
import { shanghaiDay, statsEnabled, statsNumber } from '#shared/stats/model'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '访问统计' })
interface Report { range: { from: string, to: string }, total: { pageViews: number, visitors: number }, summary: { pageViews: number, visitors: number }, daily: { day: string, pageViews: number, visitors: number }[], pages: { path: string, pageViews: number, visitors: number }[], totalPages: number }
const { current, request } = useAdminSession()
const from = ref(shanghaiDay(Date.now() - 29 * 86400_000))
const to = ref(shanghaiDay(Date.now()))
const page = ref(1)
const report = ref<Report | null>(null)
const error = ref('')
const busy = ref(false)
const enabled = statsEnabled(useRuntimeConfig().public.statsEnabled)
async function load(reset = false) {
  if (!enabled || !current.value.user?.owner)
    return
  if (reset)
    page.value = 1
  busy.value = true
  error.value = ''
  try {
    report.value = await request<Report>(`stats?${new URLSearchParams({ from: from.value, to: to.value, page: String(page.value), pageSize: '20' })}`)
  }
  catch (cause) { error.value = adminError(cause) }
  finally { busy.value = false }
}
const maximum = computed(() => Math.max(1, ...report.value?.daily.flatMap(day => [day.pageViews, day.visitors]) ?? []))
function points(field: 'pageViews' | 'visitors') {
  return report.value?.daily.map((day, i, rows) => `${20 + i / Math.max(1, rows.length - 1) * 760},${180 - day[field] / maximum.value * 160}`).join(' ') ?? ''
}
watch(() => current.value.user?.owner, () => {
  void load()
}, { immediate: true })
async function changePage(change: number) {
  page.value += change
  await load()
}
</script>

<template>
  <div>
    <h1 class="mb-8 text-page text-heading">
      访问统计
    </h1><p v-if="!enabled" class="border border-line rounded-panel p-6 text-muted">
      访问统计尚未启用。
    </p><template v-else>
      <form class="mb-6 flex flex-wrap items-end gap-4" @submit.prevent="load(true)">
        <label class="text-xs text-muted">开始日期<input v-model="from" type="date" required :max="to" class="field-control mt-2 block px-3"></label><label class="text-xs text-muted">结束日期<input v-model="to" type="date" required :min="from" :max="shanghaiDay(Date.now())" class="field-control mt-2 block px-3"></label><BaseButton type="submit" :disabled="busy">
          查询
        </BaseButton>
      </form><p v-if="error" role="alert" class="mb-5 text-error">
        {{ error }}
      </p><p v-if="busy" role="status" class="mb-5 text-muted">
        正在读取统计…
      </p><template v-if="report">
        <div class="grid grid-cols-2 mb-6 gap-4 lg:grid-cols-4">
          <div v-for="item in [{ label: '累计浏览量', value: report.total.pageViews }, { label: '累计访客', value: report.total.visitors }, { label: '区间浏览量', value: report.summary.pageViews }, { label: '区间访客', value: report.summary.visitors }]" :key="item.label" class="min-w-0 border border-line rounded-panel p-5">
            <p class="text-xs text-muted">
              {{ item.label }}
            </p><p class="mt-3 break-all text-section text-heading tabular-nums">
              {{ statsNumber(item.value) }}
            </p>
          </div>
        </div><section class="mb-6 border border-line rounded-panel p-5">
          <h2 class="text-title text-heading">
            每日趋势
          </h2><p class="mt-2 text-xs text-muted">
            实线：浏览量；虚线：访客数。日期按北京时间统计。
          </p><svg viewBox="0 0 800 200" class="mt-5 w-full" role="img" aria-label="每日浏览量与访客趋势，下方可展开详细数据"><polyline :points="points('pageViews')" fill="none" stroke="var(--color-accent-text)" stroke-width="3" /><polyline :points="points('visitors')" fill="none" stroke="var(--color-info)" stroke-width="2" stroke-dasharray="6 4" /></svg><details class="mt-3">
            <summary class="control-quiet min-h-11 cursor-pointer py-3 text-accent-soft">
              查看每日数据
            </summary><div class="max-h-96 overflow-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr>
                    <th class="p-3">
                      日期
                    </th><th class="p-3">
                      浏览量
                    </th><th class="p-3">
                      访客
                    </th>
                  </tr>
                </thead><tbody>
                  <tr v-for="day in report.daily" :key="day.day" class="border-t border-line">
                    <td class="p-3">
                      {{ day.day }}
                    </td><td class="p-3">
                      {{ statsNumber(day.pageViews) }}
                    </td><td class="p-3">
                      {{ statsNumber(day.visitors) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </section><section class="border border-line rounded-panel p-5">
          <h2 class="mb-4 text-title text-heading">
            页面排行
          </h2><div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr>
                  <th class="p-3">
                    页面路径
                  </th><th class="p-3">
                    浏览量
                  </th><th class="p-3">
                    访客
                  </th>
                </tr>
              </thead><tbody>
                <tr v-for="item in report.pages" :key="item.path" class="border-t border-line">
                  <td class="break-all p-3">
                    {{ item.path }}
                  </td><td class="p-3">
                    {{ statsNumber(item.pageViews) }}
                  </td><td class="p-3">
                    {{ statsNumber(item.visitors) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div><p v-if="!report.pages.length" class="p-5 text-center text-muted">
            该区间暂无访问记录。
          </p><div class="mt-4 flex items-center justify-end gap-3">
            <BaseButton variant="border" :disabled="page <= 1 || busy" @click="changePage(-1)">
              上一页
            </BaseButton><span class="text-xs">第 {{ page }} 页</span><BaseButton variant="border" :disabled="page * 20 >= report.totalPages || busy" @click="changePage(1)">
              下一页
            </BaseButton>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
