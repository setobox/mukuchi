<script setup lang="ts">
const scenario = useRequestURL().searchParams.get('scenario')
const failure = useState('failure', () => 0)
if (scenario === 'retry')
  failure.value = 1
const catalog = usePostCatalog()
const concurrent = scenario === 'concurrent' ? usePostCatalog() : undefined
await catalog.ready
if (concurrent)
  await concurrent.ready
if (scenario === 'refresh' || scenario === 'refresh-error') {
  if (scenario === 'refresh-error')
    failure.value = 2
  await catalog.refresh()
}
const errorAfterRefresh = catalog.error.value?.message ?? null
// A later initializer must retry failures, including failure after a success.
const later = usePostCatalog()
await later.ready
</script>

<template>
  <main>
    <span data-reader="parent">{{ catalog.data.value?.[0]?.title }}</span>
    <span data-error>{{ errorAfterRefresh }}</span>
    <CatalogReader name="list" />
    <CatalogReader name="sidebar" />
  </main>
</template>
