<script setup lang="ts">
defineProps<{ expanded: boolean }>()
</script>

<template>
  <svg
    class="menu-toggle-icon size-6 shrink-0"
    :data-expanded="expanded"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <path class="menu-top" d="M4 12h16" />
    <path class="menu-middle" d="M4 12h16" />
    <path class="menu-bottom" d="M4 12h16" />
  </svg>
</template>

<style scoped>
.menu-toggle-icon path {
  transform-origin: 12px 12px;
  transition:
    transform 240ms cubic-bezier(.22, 1, .36, 1),
    opacity 120ms ease;
}
.menu-top {
  transform: translateY(-6px);
}
.menu-bottom {
  transform: translateY(6px);
}
.menu-toggle-icon[data-expanded='true'] .menu-top {
  transform: rotate(45deg);
}
.menu-toggle-icon[data-expanded='true'] .menu-middle {
  opacity: 0;
  transform: scaleX(0);
}
.menu-toggle-icon[data-expanded='true'] .menu-bottom {
  transform: rotate(-45deg);
}
</style>
