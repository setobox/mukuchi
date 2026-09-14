<script setup lang="ts">
useProvideActionButtons();

const { site } = useAppConfig();
useHead({
  titleTemplate: (title) => (title && title !== site.name ? `${title} - ${site.name}` : site.name),
});
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout><NuxtPage /></NuxtLayout>
</template>
