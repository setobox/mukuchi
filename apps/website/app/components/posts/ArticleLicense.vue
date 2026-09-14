<script setup lang="ts">
import { formatPostDate } from '#shared/content/catalog'
import { articleLicense } from '~/shared/licenses'

defineProps<{
  title: string
  permalink: string
  publishedAt: string
}>()

const { site } = useAppConfig()
</script>

<template>
  <section aria-label="文章版权声明" class="relative isolate min-w-0 overflow-hidden border border-line rounded-panel bg-surface px-5 py-4 md:px-6 md:py-5">
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 640 640"
      class="pointer-events-none absolute right-3 top-1/2 h-40 w-40 text-heading opacity-[0.06] md:right-4 md:h-52 md:w-52 -translate-y-1/2"
    >
      <path
        fill="currentColor"
        d="m317.8 278.9l-33.2 17.3c-9.4-19.6-25.2-19.9-27.5-19.9c-22.1 0-33.2 14.6-33.2 43.8c0 23.6 9.2 43.8 33.2 43.8c14.5 0 24.6-7.1 30.6-21.3l30.6 15.5c-6.2 11.5-25.7 39-65.1 39c-22.6 0-74-10.3-74-77c0-58.7 43-77.1 72.6-77.1c30.7 0 52.7 11.9 66 35.9m143 0L428 296.2c-9.5-19.8-25.7-19.9-27.9-19.9c-22.1 0-33.2 14.6-33.2 43.8c0 23.5 9.2 43.8 33.2 43.8c14.4 0 24.6-7.1 30.5-21.3l31 15.5c-2.1 3.8-21.4 39-65.1 39c-22.7 0-74-9.9-74-77c0-58.7 43-77.1 72.6-77.1c30.7 0 52.6 11.9 65.6 35.9zM319.6 72C176.7 72 72 187.1 72 320.1c0 138.4 113.6 248 247.6 248c129.9 0 248.4-100.9 248.4-248C568 182.2 461.4 72 319.6 72m.9 450.8c-112.5 0-203.7-93-203.7-202.8c0-105.4 85.4-203.3 203.7-203.3c112.5 0 202.8 89.5 202.8 203.3c0 121.7-99.7 202.8-202.8 202.8"
      />
    </svg>
    <div class="relative z-10 min-w-0">
      <h2 class="break-words text-title text-heading font-semibold">
        {{ title }}
      </h2>
      <a
        :href="permalink"
        rel="bookmark"
        class="mt-1 block break-all text-sm text-accent-soft underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-current"
      >
        {{ permalink }}
      </a>
      <dl class="grid grid-cols-[minmax(0,1fr)_max-content] mb-0 mt-4 gap-x-4 gap-y-3 md:grid-cols-[max-content_max-content_minmax(0,1fr)] md:gap-x-8">
        <div class="min-w-0">
          <dt class="text-sm text-muted">
            作者
          </dt>
          <dd class="m-0 mt-0.5 break-words text-heading">
            {{ site.name }}（{{ site.owner.name }}）
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="text-sm text-muted">
            发布于
          </dt>
          <dd class="m-0 mt-0.5 text-heading tabular-nums">
            <time :datetime="publishedAt">{{ formatPostDate(publishedAt) }}</time>
          </dd>
        </div>
        <div class="col-span-2 min-w-0 md:col-span-1">
          <dt class="text-sm text-muted">
            许可协议
          </dt>
          <dd class="m-0 mt-0.5">
            <a
              :href="articleLicense.url"
              target="_blank"
              rel="license noopener noreferrer"
              class="break-words text-accent-soft underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-current"
            >
              {{ articleLicense.name }}
            </a>
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>
