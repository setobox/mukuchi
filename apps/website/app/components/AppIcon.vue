<script setup lang="ts">
import { icons, type IconName } from "~/shared/icons";
defineProps<{ name: IconName }>();
</script>

<template>
  <span
    :class="icons[name]"
    class="inline-block size-[1.1em] shrink-0 align-[-0.15em]"
    aria-hidden="true"
  />
</template>
