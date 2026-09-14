<script setup lang="ts">
useProvideActionButtons()
useProvideCommandPalette()
useThemeHead()

const { site } = useAppConfig()
useHead({
  titleTemplate: title => (title && title !== site.name ? `${title} - ${site.name}` : site.name),
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout><NuxtPage /></NuxtLayout>
  <ClientOnly><CommandPalette /></ClientOnly>
</template>
