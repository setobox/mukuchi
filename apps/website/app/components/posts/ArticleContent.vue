<script setup lang="ts">
import type { PageCollectionItemBase } from "@nuxt/content";
defineProps<{ value: PageCollectionItemBase }>();
</script>
<template>
  <ContentRenderer
    :value="value"
    class="min-w-0 break-words leading-8 [&_blockquote]:mx-0 [&_img]:my-6 [&_li]:my-2 [&_p]:my-5 [&_pre]:my-6 [&_table]:my-6 [&_h2]:mb-4 [&_h2]:mt-10 [&_h3]:mb-3 [&_h3]:mt-8 [&_h4]:mb-3 [&_h4]:mt-7 [&_h5]:mb-3 [&_h5]:mt-7 [&_h6]:mb-3 [&_h6]:mt-7 [&_table]:block [&_img]:h-auto [&_table]:max-w-full [&_table]:border-collapse [&_ol]:list-decimal [&_ul]:list-disc [&_pre]:overflow-x-auto [&_table]:overflow-x-auto [&_td]:border [&_th]:border [&_blockquote]:border-l-3 [&_blockquote]:border-accent [&_td]:border-line [&_th]:border-line-strong [&_img]:rounded-xl [&_pre]:rounded-xl [&_blockquote]:bg-surface [&_pre]:bg-surface [&_pre]:p-5 [&_blockquote]:px-5 [&_blockquote]:py-1 [&_td]:px-4 [&_td]:py-2 [&_th]:px-4 [&_th]:py-2 [&_ol]:pl-6 [&_ul]:pl-6 [&_th]:text-left [&_code]:text-[0.9em] [&_h2]:text-section [&_h3]:text-title [&_h4]:text-title [&_h5]:text-title [&_h6]:text-title [&_pre]:text-sm [&_a]:text-accent-soft [&_h2]:text-heading [&_h3]:text-heading [&_h4]:text-heading [&_h5]:text-heading [&_h6]:text-heading [&_strong]:text-heading [&_code]:font-mono [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-4"
  />
</template>
