<script setup lang="ts">
import { ref } from 'vue'
import { useProfileQuote } from '../../composables/useProfileQuote'
import AppIcon from '../AppIcon.vue'
import BorderGlow from '../base/BorderGlow.vue'

const { site } = useAppConfig()
const quote = useProfileQuote()
const hovered = ref(false)
const focused = ref(false)
const colors = ['#c084fc', '#f472b6', '#38bdf8']

function onFocusOut(event: FocusEvent) {
  const card = event.currentTarget
  if (card instanceof HTMLElement && (!(event.relatedTarget instanceof Node) || !card.contains(event.relatedTarget)))
    focused.value = false
}
</script>

<template>
  <section
    class="profile-card mx-auto max-w-120 w-full rounded-panel lg:max-w-none"
    tabindex="0"
    aria-label="站主介绍"
    :data-revealed="hovered || focused"
    @pointerenter="hovered = true"
    @pointerleave="hovered = false"
    @pointercancel="hovered = false"
    @focusin="focused = true"
    @focusout="onFocusOut"
  >
    <BorderGlow
      :colors="colors"
      background-color="var(--color-surface)"
      glow-color="270 95 82"
      :border-radius="16"
      :glow-radius="24"
      :glow-intensity="0.7"
      :fill-opacity="0.14"
      :animated="false"
    >
      <div class="flex flex-col gap-5 p-5">
        <div class="min-h-14 flex items-center justify-center">
          <p class="max-w-full rounded-2xl bg-accent-surface px-3 py-1.5 text-center text-xs text-accent-soft leading-5">
            {{ quote }}
          </p>
        </div>
        <div class="profile-body grid min-w-0 items-center gap-5">
          <!-- The persistent name link is the keyboard entry; this duplicate fades on focus. -->
          <NuxtLink to="/about" :aria-label="`关于${site.owner.name}`" tabindex="-1" class="profile-avatar mx-auto rounded-full">
            <img
              :src="site.owner.avatar"
              :alt="`${site.owner.name}的头像`"
              width="112"
              height="112"
              decoding="async"
              class="size-28 border-3 border-line-strong rounded-full object-cover"
            >
          </NuxtLink>
          <div class="profile-introduction grid gap-3 text-s text-heading leading-7">
            <p v-for="(paragraph, index) in site.owner.introduction" :key="index" :class="{ 'font-semibold': index === 0 }">
              {{ paragraph }}
            </p>
          </div>
        </div>
        <footer class="grid grid-cols-[minmax(0,1fr)_44px] items-end gap-x-3">
          <NuxtLink to="/about" class="col-span-2 min-h-11 flex items-center rounded text-[18px] text-heading font-semibold leading-7">
            {{ site.owner.name }} · {{ site.name }}
          </NuxtLink>
          <code class="min-w-0 whitespace-pre-wrap text-xs text-muted leading-5 font-mono">{{ site.owner.signature }}</code>
          <a
            :href="site.owner.github"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`${site.name} 的 GitHub（在新标签页打开）`"
            class="size-11 flex items-center justify-center rounded-full bg-accent-surface text-xl text-accent-soft transition-colors hover:bg-line-strong hover:text-heading"
          >
            <AppIcon name="github" />
          </a>
        </footer>
      </div>
    </BorderGlow>
  </section>
</template>

<style scoped>
/* CSS keeps the initial SSR layout responsive without a hydration-time resize. */
@media (min-width: 1200px) and (hover: hover) and (pointer: fine) {
  .profile-body {
    gap: 0;
    min-height: 160px;
  }
  .profile-avatar,
  .profile-introduction {
    grid-area: 1 / 1;
    transition: opacity 200ms ease, visibility 200ms ease;
  }
  .profile-introduction {
    opacity: 0;
    visibility: hidden;
  }
  .profile-card[data-revealed="true"] .profile-avatar {
    opacity: 0;
    visibility: hidden;
  }
  .profile-card[data-revealed="true"] .profile-introduction {
    opacity: 1;
    visibility: visible;
  }
}
</style>
