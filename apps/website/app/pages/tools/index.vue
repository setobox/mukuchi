<script setup lang="ts">
definePageMeta({ section: "tools", pageKind: "index", pageTitle: "工具" });
useSeoMeta({ title: "工具", description: "实用工具。" });
</script>

<template>
  <div>
    <PageHeading title="工具" />
    <div class="mb-6 flex items-center gap-2.5 border-t border-line pt-6 text-muted">
      <AppIcon name="shapes" class="text-accent-soft" /><span>以下工具尚未开放。</span>
    </div>
    <div class="grid gap-6 md:grid-cols-2">
      <article class="overflow-hidden rounded-panel border border-line">
        <div
          class="relative h-60 flex items-center justify-center overflow-hidden bg-[color-mix(in_srgb,var(--color-accent)_4%,var(--color-surface))]"
          aria-hidden="true"
        >
          <div
            class="h-[152px] w-56 flex rotate-[-6deg] flex-col justify-between rounded-[5px] border border-[color-mix(in_srgb,var(--color-accent)_28%,transparent)] bg-canvas px-6 py-[18px]"
          >
            <span class="font-mono leading-[normal] tracking-[2px] text-accent-soft">MUKUCHI</span
            ><strong class="text-[23px] font-medium leading-normal text-heading"
              >文章封面<br /></strong
            ><span class="h-0.5 w-[35px] bg-accent" />
          </div>
          <AppIcon
            name="image"
            class="absolute right-[calc(50%-140px)] bottom-[35px] size-[50px]! rounded-[13px] border border-line-strong bg-accent-soft! p-[13px]"
          />
        </div>
        <div class="px-[26px] py-[25px]">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-[18px] text-heading">封面制作</h2>
            <BaseTag>尚未开放</BaseTag>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
