<script setup lang="ts">
import type { ContentTerm } from '#shared/content/browse'
import type { TaxonomyKind } from '#shared/content/taxonomy'
import { computed, ref, useId, useTemplateRef } from 'vue'
import { rankTerms, searchTerms } from '#shared/content/browse'
import { taxonomyPath } from '#shared/content/taxonomy'

const props = defineProps<{ kind: TaxonomyKind, terms: ContentTerm[] }>()
const query = ref('')
const inputId = useId()
const input = useTemplateRef<HTMLInputElement>('input')
const label = computed(() => props.kind === 'category' ? '分类' : '标签')
const ranked = computed(() => rankTerms(props.terms))
const visible = computed(() => searchTerms(ranked.value, query.value))
function clear() {
  query.value = ''
  input.value?.focus()
}
</script>

<template>
  <section :aria-label="`全部${label}`">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
      <p role="status" class="text-muted">
        <template v-if="query.trim()">
          找到 {{ visible.length }} 个 ·
        </template>共 {{ terms.length }} 个{{ label }}
      </p>
      <div v-if="kind === 'tag'" class="field-group min-w-0 w-full flex items-center gap-2 border border-line-strong rounded-button bg-canvas pl-3 md:w-64">
        <AppIcon name="search" class="shrink-0 text-muted" />
        <label :for="inputId" class="sr-only">搜索标签</label>
        <input :id="inputId" ref="input" v-model="query" type="search" placeholder="搜索标签" class="min-h-11 min-w-0 w-full bg-transparent py-2 outline-none" autocomplete="off">
        <button v-if="query" type="button" class="icon-button" aria-label="清空标签搜索" @click="clear">
          <AppIcon name="close" />
        </button>
        <span v-else class="w-3 shrink-0" aria-hidden="true" />
      </div>
    </div>
    <ContentEmptyState v-if="!visible.length" title="没有匹配的标签" description="试试其他关键词，或清空搜索。" icon="search" />
    <ul v-else class="m-0 list-none p-0" :class="kind === 'category' ? 'grid gap-3 md:grid-cols-2' : 'flex flex-wrap gap-3'">
      <li v-for="term in visible" :key="term.name" class="min-w-0" :class="{ 'max-w-full': kind === 'tag' }">
        <NuxtLink
          :to="taxonomyPath(kind, term.name)"
          :aria-label="`${term.name}，${term.count} 篇文章`"
          class="control-quiet max-w-full min-h-11 flex items-center gap-3 border border-line px-4 text-heading focus-visible:border-accent hover:border-accent"
          :class="kind === 'category' ? 'h-full bg-surface py-4' : 'py-2'"
        >
          <AppIcon v-if="kind === 'category'" name="folder" class="shrink-0 text-muted" />
          <span class="min-w-0 break-words" :class="{ 'flex-1': kind === 'category' }"><span v-if="kind === 'tag'" class="mr-1 text-muted" aria-hidden="true">#</span>{{ term.name }}</span>
          <span class="shrink-0 text-sm text-muted font-mono tabular-nums">{{ term.count }}</span>
          <AppIcon v-if="kind === 'category'" name="chevron" class="shrink-0 text-muted" />
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
input[type='search']::-webkit-search-cancel-button { appearance: none; }
</style>
