<script setup lang="ts">
import { provide } from 'vue'
import { useRoute } from '#app'
import { imageLinkKey } from '~/features/images/context'

withDefaults(defineProps<{ href?: string, target?: string }>(), { href: '' })
const route = useRoute()
provide(imageLinkKey, true)
</script>

<template>
  <NuxtLink :to="href.startsWith('#') ? route.fullPath.split('#')[0] + href : href" :target="target" class="ui-link">
    <slot />
  </NuxtLink>
</template>
