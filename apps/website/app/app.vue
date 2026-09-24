<script setup lang="ts">
import { rssPath } from '#shared/rss/config'
import BaseUiProvider from './components/base/BaseUiProvider.vue'

useProvideActionButtons()
useProvideCommandPalette()
useThemeHead()

const { site } = useAppConfig()
const route = useRoute()
const canonical = usePageUrl(() => route.path)
const rssUrl = usePageUrl(rssPath)
const faviconHref = `${useRuntimeConfig().app.baseURL.replace(/\/$/, '')}/favicon.ico`
useHead({
  titleTemplate: title => (title && title !== site.name ? `${title} - ${site.name}` : site.name),
  link: [
    { rel: 'icon', href: faviconHref },
    { key: 'canonical', rel: 'canonical', href: canonical },
    { rel: 'alternate', type: 'application/rss+xml', title: `${site.name} RSS`, href: rssUrl },
  ],
})
useSeoMeta({ ogUrl: canonical })
</script>

<template>
  <BaseUiProvider>
    <NuxtRouteAnnouncer />
    <NuxtLayout><NuxtPage /></NuxtLayout>
    <ClientOnly><CommandPalette /></ClientOnly>
  </BaseUiProvider>
</template>
