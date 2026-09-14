<script setup lang="ts">
import type { PostMeta } from '#shared/content/schema'
import { articleNotices, shanghaiDay } from '#shared/content/notices'

const props = defineProps<{ post: PostMeta, path: string }>()
const config = useAppConfig()
const today = useState(`article-day:${props.path}`, () => shanghaiDay(new Date()))
// Preserve the server day during hydration; each later client entry gets a fresh day.
if (import.meta.client && !useNuxtApp().isHydrating)
  today.value = shanghaiDay(new Date())
const notices = computed(() => articleNotices(props.post, config.site.article.notices, today.value))
</script>

<template>
  <aside v-if="notices.wip || notices.stale" class="grid mt-6 gap-3 text-s" aria-label="文章状态">
    <p v-if="notices.wip" class="flex items-start gap-3 border border-line rounded-xl bg-surface p-4">
      <AppIcon name="construction" class="mt-1 shrink-0 text-info" />
      <span><strong class="text-info font-semibold">施工中：</strong>本文仍在完善。</span>
    </p>
    <p v-if="notices.stale" class="flex items-start gap-3 border border-line rounded-xl bg-surface p-4">
      <AppIcon name="clock" class="mt-1 shrink-0 text-warn" />
      <span><strong class="text-warn font-semibold">内容时效提醒：</strong>本文最后维护于 {{ notices.maintained }}，部分内容可能已发生变化。</span>
    </p>
  </aside>
</template>
