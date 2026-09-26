<script setup lang="ts">
import { computed } from 'vue'
import SeriesDisclosure from './SeriesDisclosure.vue'

const props = defineProps<{ name: string, currentPath: string }>()
const { series, data, error, status, refresh } = usePostCatalog()
const group = computed(() => series.value.find(group => group.name === props.name.trim()))
</script>

<template>
  <section v-if="group || error || (status === 'pending' && !data)" class="mt-8" aria-label="同系列文章" data-pagefind-ignore>
    <CatalogStatus label="系列目录" :pending="status === 'pending' && !data" :failed="!!error" :empty="false" icon="list" @retry="refresh()">
      <SeriesDisclosure v-if="group" :key="group.name" :group="group" :current-path="currentPath" />
    </CatalogStatus>
  </section>
</template>
