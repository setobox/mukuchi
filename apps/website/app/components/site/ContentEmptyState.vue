<script setup lang="ts">
import type { IconName } from "~/shared/icons";
withDefaults(defineProps<{ title?: string; description?: string; icon?: IconName }>(), {
  title: "暂无文章",
  icon: "pen",
});
</script>

<template>
  <section
    class="min-h-[390px] flex flex-col items-center px-4 pb-7 pt-16 text-center lg:min-h-[420px] lg:pt-18"
    :aria-label="title"
  >
    <div class="relative mb-[25px] grid size-30 place-items-center" aria-hidden="true">
      <div
        class="relative z-1 h-[82px] w-16 flex rotate-[-8deg] flex-col gap-2 rounded-md border border-line-strong bg-canvas px-3.5 py-[21px]"
      >
        <span class="h-px w-7.5 bg-line-strong" /><span class="h-px w-7.5 bg-line-strong" /><span
          class="h-px w-[19px] bg-line-strong"
        /><AppIcon
          :name="icon"
          class="absolute -right-3.5 bottom-1 size-7! rotate-[8deg] text-accent-soft"
        />
      </div>
      <div class="absolute size-[110px] rounded-full border border-dashed border-line" />
    </div>
    <h2 class="text-title text-heading tracking-[0.3px]">{{ title }}</h2>
    <p v-if="description" class="mt-3 text-muted leading-[1.9]">{{ description }}</p>
  </section>
</template>
