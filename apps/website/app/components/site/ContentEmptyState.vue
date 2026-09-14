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
    <div class="relative grid mb-[25px] size-30 place-items-center" aria-hidden="true">
      <div
        class="relative z-1 h-[82px] w-16 flex flex-col rotate-[-8deg] gap-2 border border-line-strong rounded-md bg-canvas px-3.5 py-[21px]"
      >
        <span class="h-px w-7.5 bg-line-strong" /><span class="h-px w-7.5 bg-line-strong" /><span
          class="h-px w-[19px] bg-line-strong"
        /><AppIcon
          :name="icon"
          class="absolute bottom-1 rotate-[8deg] text-accent-soft -right-3.5 size-7!"
        />
      </div>
      <div class="absolute size-[110px] border border-line rounded-full border-dashed" />
    </div>
    <h2 class="text-title text-heading tracking-[0.3px]">{{ title }}</h2>
    <p v-if="description" class="mt-3 text-muted leading-[1.9]">{{ description }}</p>
  </section>
</template>
