<script setup lang="ts">
import { provide } from 'vue'
import { imageLinkKey } from '~/features/images/context'

withDefaults(defineProps<{ href?: string, target?: string }>(), { href: '' })
provide(imageLinkKey, true)
</script>

<template>
  <NuxtLink :href="href" :target="target">
    <slot />
  </NuxtLink>
</template>
