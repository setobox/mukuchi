<script setup lang="ts">
import type { RepositorySnapshots } from '#shared/github/repository'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import generated from '#github-snapshots'
import { emptyRepository, repositoryCount, repositoryCountLabel, repositoryIdSchema } from '#shared/github/repository'
import AppIcon from '../AppIcon.vue'

const props = defineProps<{ repo: string }>()
const snapshots: RepositorySnapshots = generated
const valid = computed(() => repositoryIdSchema.safeParse(props.repo).success)
const card = computed(() => snapshots[props.repo.toLowerCase()] ?? emptyRepository(props.repo))
const owner = computed(() => card.value.repo.split('/')[0])
const name = computed(() => card.value.repo.split('/')[1])
const failedAvatar = ref(false)
const avatar = useTemplateRef<HTMLImageElement>('avatar')
function checkAvatar() {
  if (avatar.value?.complete && avatar.value.naturalWidth === 0)
    failedAvatar.value = true
}
onMounted(checkAvatar)
watch(() => card.value.avatar, async () => {
  failedAvatar.value = false
  await nextTick()
  checkAvatar()
})
</script>

<template>
  <a
    v-if="valid" :href="`https://github.com/${card.repo}`" target="_blank" rel="noopener noreferrer"
    data-prose-card="github"
    class="group my-6 block min-w-0 border border-line rounded-[var(--radius-panel)] bg-surface p-5 transition-colors duration-200 focus-visible:border-accent hover:border-accent text-ink! no-underline! motion-reduce:transition-none"
  >
    <span class="flex items-start justify-between gap-3">
      <span class="min-w-0 flex items-start gap-2.5 text-l leading-8">
        <img v-if="card.avatar && !failedAvatar" ref="avatar" :src="card.avatar" alt="" width="32" height="32" loading="lazy" decoding="async" class="size-8 shrink-0 rounded-full object-cover" @error="failedAvatar = true">
        <span v-else class="size-8 flex shrink-0 items-center justify-center rounded-full bg-canvas text-muted" aria-hidden="true"><AppIcon name="user" /></span>
        <span class="min-w-0 break-all"><span class="text-muted">{{ owner }}</span><span class="mx-1.5 text-muted">/</span><span class="text-heading font-bold transition-colors group-focus-visible:text-accent-soft group-hover:text-accent-soft">{{ name }}</span></span>
      </span>
      <AppIcon name="github" class="mt-1 shrink-0 text-2xl text-heading" />
    </span>
    <span class="line-clamp-2 mt-3 min-h-6 text-s leading-6" :title="card.description ?? undefined">{{ card.description ?? '-' }}</span>
    <span class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted leading-6">
      <span class="inline-flex items-center gap-1.5" :aria-label="repositoryCountLabel('Star', card.stars)" :title="repositoryCountLabel('Star', card.stars)"><AppIcon name="star" />{{ repositoryCount(card.stars) }}</span>
      <span class="inline-flex items-center gap-1.5" :aria-label="repositoryCountLabel('Fork', card.forks)" :title="repositoryCountLabel('Fork', card.forks)"><AppIcon name="fork" />{{ repositoryCount(card.forks) }}</span>
      <span class="min-w-0 inline-flex items-center gap-1.5 break-all" :aria-label="`许可证：${card.license ?? '暂无数据'}`"><AppIcon name="license" />{{ card.license ?? '-' }}</span>
      <span class="min-w-0 inline-flex items-center gap-1.5 break-all" :aria-label="`语言：${card.language ?? '暂无数据'}`"><AppIcon name="code" />{{ card.language ?? '-' }}</span>
    </span>
    <span class="sr-only">在新标签页打开 GitHub 仓库</span>
  </a>
  <span v-else class="my-6 block text-s text-error">GitHub 仓库标识无效</span>
</template>
