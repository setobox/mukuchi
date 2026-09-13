<script setup lang="ts">
type ButtonVariant = "default" | "border" | "ghost" | "link";

const variantClasses: Record<ButtonVariant, string> = {
  default: "border-transparent bg-accent px-[17px] text-canvas font-semibold hover:bg-accent-soft",
  border: "border-line-strong px-[17px] text-heading hover:bg-surface",
  ghost: "border-transparent px-[17px] hover:bg-surface",
  link: "border-transparent px-1 text-accent-soft underline underline-offset-5",
};

withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
  }>(),
  { variant: "default", type: "button", disabled: false },
);
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :data-variant="variant"
    :class="variantClasses[variant]"
    class="min-h-11 inline-flex items-center justify-center gap-2 rounded-button border py-[9px] text-base [transition-property:background,color,border-color] duration-160 ease-[ease] disabled:pointer-events-none disabled:opacity-40"
  >
    <slot />
  </button>
</template>
