<script setup lang="ts">
const { site } = useAppConfig();
</script>

<template>
  <div class="flex flex-col gap-6">
    <section
      class="rounded-panel border border-line bg-surface grid grid-cols-[72px_minmax(0,1fr)] items-center gap-4 overflow-hidden p-4 lg:block lg:p-0"
      aria-label="站点信息"
    >
      <div
        class="relative h-18 flex items-center justify-center overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--color-accent)_7%,var(--color-canvas))] lg:h-40 lg:rounded-none"
        aria-hidden="true"
      >
        <div
          class="profile-orbit absolute hidden size-[178px] translate-x-[62px] translate-y-[45px] rounded-full border border-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] lg:block"
        />
      </div>
      <div class="relative lg:static lg:px-6 lg:pt-[22px] lg:pb-5">
        <p
          class="flex items-center gap-[9px] font-mono text-[18px] font-medium leading-[normal] tracking-[-0.7px] text-heading lg:text-[20px]"
        >
          {{ site.owner.name }}
        </p>
        <NuxtLink
          to="/about"
          class="mt-1.5 min-h-6 inline-flex items-center gap-2 text-accent-soft lg:mt-[18px]"
          >关于我<AppIcon name="arrow"
        /></NuxtLink>
      </div>
    </section>
    <slot name="after-profile" />
    <section class="hidden px-2 lg:block" aria-labelledby="sidebar-tags">
      <h2 id="sidebar-tags" class="section-label">标签</h2>
      <p class="mt-3.5 text-muted">暂无标签</p>
    </section>
    <section class="hidden px-2 lg:block" aria-labelledby="sidebar-stats">
      <h2 id="sidebar-stats" class="section-label">网站统计</h2>
      <dl class="mb-0 mt-5 grid grid-cols-3">
        <div
          v-for="(label, index) in ['文章', '标签', '专栏']"
          :key="label"
          :class="{ 'border-l border-line pl-4': index > 0 }"
        >
          <dt class="text-muted">{{ label }}</dt>
          <dd
            class="m-0 mt-1.5 font-mono text-[18px] leading-[normal] text-ink"
            aria-label="暂无数据"
          >
            —
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.profile-orbit::after {
  content: "";
  position: absolute;
  inset: 20px;
  border: inherit;
  border-radius: inherit;
}
</style>
