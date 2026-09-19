<script setup lang="ts">
type ButtonVariant = 'default' | 'border' | 'ghost' | 'link'

withDefaults(
  defineProps<{
    variant?: ButtonVariant
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }>(),
  { variant: 'default', type: 'button', disabled: false },
)

const variantClasses: Record<ButtonVariant, string> = {
  default: 'button-primary',
  border: 'control-quiet border-line-strong px-[17px] text-heading hover:border-accent',
  ghost: 'control-quiet border-transparent px-[17px] text-heading',
  link: 'ui-link border-transparent px-1 text-accent-soft underline decoration-line-strong',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :data-variant="variant"
    :class="variantClasses[variant]"
    class="control-base border py-[9px] text-base"
  >
    <slot />
  </button>
</template>
