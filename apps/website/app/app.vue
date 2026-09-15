<script setup lang="ts">
useProvideActionButtons()
useProvideCommandPalette()
useThemeHead()

const { site } = useAppConfig()
const route = useRoute()
const canonical = usePageUrl(() => route.path)
useHead({
  titleTemplate: title => (title && title !== site.name ? `${title} - ${site.name}` : site.name),
  link: [{ rel: 'canonical', href: canonical }],
})
useSeoMeta({ ogUrl: canonical })
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout><NuxtPage /></NuxtLayout>
  <ClientOnly><CommandPalette /></ClientOnly>
</template>
