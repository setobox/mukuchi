<script setup lang="ts">
import { useSupported } from '@vueuse/core'
import { ConfigProvider } from 'reka-ui'

// The root already reserves the gutter; a second body padding would shift the page.
const stableGutter = useSupported(() => typeof CSS !== 'undefined' && CSS.supports('scrollbar-gutter', 'stable'))
</script>

<template>
  <ConfigProvider :scroll-body="stableGutter ? { padding: 0, margin: 0 } : true">
    <slot />
  </ConfigProvider>
</template>
