<script setup lang="ts">
import { onScopeDispose, provide, watch } from 'vue'
import { useRoute } from '#app'
import { createImagePreview, imagePreviewKey } from '~/features/images/context'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ contentKey: string }>()
const preview = createImagePreview()
provide(imagePreviewKey, preview)
const route = useRoute()
watch([() => route.path, () => props.contentKey], preview.close)
onScopeDispose(preview.close)
</script>

<template>
  <div
    v-bind="$attrs"
    class="article-body min-w-0 break-words text-m leading-[1.8] [&_:is(ul,ol)]:my-5 [&_blockquote]:mx-0 [&_blockquote]:my-6 [&_hr]:my-10 [&_li]:my-2 [&_li>p]:my-2 [&_p]:my-5 [&_table]:my-6 [&_:is(h1,h2)]:mb-4 [&_:is(h1,h2)]:mt-10 [&_:is(h3,h4,h5,h6)]:mb-3 [&_:is(h3,h4,h5,h6)]:mt-8 [&_li>input]:mr-2 [&_table]:block [&_table]:max-w-full [&_table]:border-collapse [&_ol]:list-decimal [&_ul]:list-disc [&_table]:overflow-x-auto [&_:is(td,th)]:border [&_blockquote]:border-l-3 [&_hr]:border-t [&_:is(td,th)]:border-line-strong [&_blockquote]:border-accent [&_hr]:border-line-strong [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-code [&_blockquote]:bg-surface [&_th]:bg-surface [&_:is(td,th)]:px-4 [&_:is(td,th)]:py-2 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_blockquote]:px-5 [&_blockquote]:py-1 [&_:is(ul,ol)]:pl-6 [&_th]:text-left [&_:is(h3,h4,h5,h6)]:text-l [&_:not(pre)>code]:text-[0.9em] [&_h1]:text-page [&_h2]:text-section [&_table]:text-s [&_:is(h1,h2,h3,h4,h5,h6)]:text-themed [&_:not(pre)>code]:text-heading [&_a]:text-accent-soft [&_strong]:text-heading [&_th]:text-heading [&_:is(h1,h2,h3,h4,h5,h6)_a]:text-inherit [&_:is(h3,h4,h5,h6)]:font-bold [&_code]:font-mono [&_:is(h1,h2,h3,h4,h5,h6)_a:focus-visible]:underline [&_:is(h1,h2,h3,h4,h5,h6)_a:hover]:underline [&_a]:underline [&_a:focus-visible]:decoration-current [&_a:hover]:decoration-current [&_a]:decoration-line-strong [&_a]:underline-offset-4 [&_:is(h1,h2,h3,h4,h5,h6)_a]:no-underline"
  >
    <slot />
  </div>
  <ImagePreview :image="preview.image.value" @close="preview.close" />
</template>

<style>
.article-body h2 > a { --heading-hashes: '##'; }
.article-body h3 > a { --heading-hashes: '###'; }
.article-body h4 > a { --heading-hashes: '####'; }
.article-body h5 > a { --heading-hashes: '#####'; }
.article-body h6 > a { --heading-hashes: '######'; }

.article-body :is(h2, h3, h4, h5, h6) > a::after {
  content: var(--heading-hashes);
  display: inline-block;
  margin-inline-start: .5em;
  color: var(--color-title);
  font-family: var(--font-mono);
  font-size: 1em;
  font-weight: 400;
  text-decoration: none;
  white-space: nowrap;
  opacity: 0;
  transition: opacity var(--duration-interaction) var(--ease-interaction);
}

.article-body :is(h2, h3, h4, h5, h6):hover > a::after,
.article-body :is(h2, h3, h4, h5, h6) > a:focus-visible::after {
  opacity: 1;
}
</style>
