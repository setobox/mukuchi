<script setup lang="ts">
type TagTone = "info" | "success" | "warn" | "error" | "current";

withDefaults(defineProps<{ tone?: TagTone }>(), {
  tone: "current",
});

const toneClasses: Record<TagTone, string> = {
  current: "[--tag-color:currentColor]",
  info: "[--tag-color:var(--color-info)]",
  success: "[--tag-color:var(--color-success)]",
  warn: "[--tag-color:var(--color-warn)]",
  error: "[--tag-color:var(--color-error)]",
};
</script>

<template>
  <span
    :class="toneClasses[tone]"
    :data-tone="tone"
    class="w-fit inline-flex items-center gap-1 whitespace-nowrap border border-[color-mix(in_srgb,var(--tag-color)_15%,transparent)] rounded-[5px] bg-[color-mix(in_srgb,var(--tag-color)_5%,transparent)] px-2 py-[3px] text-[var(--tag-color)] leading-[1.6]"
    ><slot
  /></span>
</template>
