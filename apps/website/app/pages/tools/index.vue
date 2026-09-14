<script setup lang="ts">
definePageMeta({ section: 'tools', pageKind: 'index', pageTitle: '工具' })
useSeoMeta({ title: '工具', description: '实用工具。' })

const { isScrolled, scrollToTop } = useScrollToTop()
useActionButton({
  id: 'home',
  icon: 'i-lucide-house',
  label: '返回文章列表',
  order: 10,
  async onClick() {
    await navigateTo('/posts')
  },
})
useActionButton({
  id: 'top',
  icon: 'i-lucide-chevron-up',
  label: '回到页面顶部',
  order: 40,
  visible: isScrolled,
  onClick: scrollToTop,
})
</script>

<template>
  <div>
    <PageHeading title="工具" />
    <div class="mb-6 flex items-center gap-2.5 border-t border-line pt-6 text-muted">
      <AppIcon name="shapes" class="text-accent-soft" /><span>以下工具尚未开放。</span>
    </div>
    <div class="grid gap-6 md:grid-cols-2">
      <article class="overflow-hidden border border-line rounded-panel">
        <div
          class="relative h-60 flex items-center justify-center overflow-hidden bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-surface))]"
          aria-hidden="true"
        >
          <div
            class="h-[152px] w-56 flex flex-col rotate-[-6deg] justify-between border border-[color-mix(in_srgb,var(--color-accent)_28%,transparent)] rounded-[5px] bg-canvas px-6 py-[18px]"
          >
            <span class="text-accent-soft leading-[normal] tracking-[2px] font-mono">MUKUCHI</span><strong class="text-[23px] text-heading font-medium leading-normal">文章封面<br></strong><span class="h-0.5 w-[35px] bg-accent" />
          </div>
          <AppIcon
            name="image"
            class="absolute bottom-[35px] right-[calc(50%-140px)] border border-line-strong rounded-[13px] bg-accent p-[13px] text-on-accent size-[50px]!"
          />
        </div>
        <div class="px-[26px] py-[25px]">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-[18px] text-heading">
              封面制作
            </h2>
            <BaseTag>尚未开放</BaseTag>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
