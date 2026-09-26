<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

defineProps<{ id?: string, level: 2 | 3 | 4 | 5 | 6 }>()
const heading = useTemplateRef<HTMLElement>('heading')
const text = useTemplateRef<HTMLElement>('text')
const hashes = useTemplateRef<HTMLElement>('hashes')
const hovered = ref(false)
const focused = ref(false)
const ready = ref(false)
const active = computed(() => hovered.value || focused.value)
const reduced = usePreferredReducedMotion()
let disposed = false
let timeline: ReturnType<typeof import('gsap')['gsap']['timeline']> | undefined

function sync() {
  if (!timeline)
    return
  if (reduced.value === 'reduce') {
    timeline.progress(active.value ? 1 : 0).pause()
    return
  }
  if (active.value)
    timeline.timeScale(1).play()
  else
    timeline.timeScale(1.8).reverse()
}

function onFocusOut(event: FocusEvent) {
  focused.value = event.relatedTarget instanceof Node && !!heading.value?.contains(event.relatedTarget)
}

watch([active, reduced], sync)
onMounted(async () => {
  if (!text.value || !hashes.value)
    return
  let engine: typeof import('gsap')['gsap']
  try {
    engine = (await import('gsap')).gsap
  }
  catch {
    return // Keep the CSS hover/focus feedback if the animation chunk fails to load.
  }
  if (disposed || !text.value || !hashes.value)
    return
  timeline = engine.timeline({ paused: true })
    .fromTo(text.value, { '--heading-underline': '0%' }, { '--heading-underline': '100%', 'duration': 0.24, 'ease': 'power2.out' }, 0)
    .fromTo(hashes.value.children, { opacity: 0, y: 3 }, { opacity: 1, y: 0, duration: 0.16, stagger: 0.025, ease: 'power2.out' }, 0.035)
  ready.value = true
  sync()
})
onBeforeUnmount(() => {
  disposed = true
  timeline?.revert()
})
</script>

<template>
  <component
    :is="`h${level}`"
    :id="id"
    ref="heading"
    class="article-heading"
    :data-motion-ready="ready || undefined"
    @pointerenter="hovered = $event.pointerType !== 'touch'"
    @pointerleave="hovered = false"
    @pointercancel="hovered = false"
    @focusin="focused = true"
    @focusout="onFocusOut"
  >
    <a v-if="id" :href="`#${id}`">
      <span ref="text" class="article-heading-text"><slot /></span><span ref="hashes" class="article-heading-hashes" aria-hidden="true"><span v-for="index in level" :key="index">#</span></span>
    </a>
    <slot v-else />
  </component>
</template>

<style scoped>
.article-heading {
  display: block;
}

.article-heading > a {
  text-decoration: none !important;
}

.article-heading-text {
  --heading-underline: 0%;
  padding-bottom: .15em;
  background-image: linear-gradient(currentColor, currentColor);
  background-repeat: no-repeat;
  background-position: left bottom;
  background-size: var(--heading-underline) 1px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.article-heading-hashes {
  display: inline-block;
  margin-inline-start: .5em;
  color: var(--color-title);
  font-family: var(--font-mono);
  font-weight: 400;
  white-space: nowrap;
  user-select: none;
}

.article-heading-hashes > span {
  display: inline-block;
  opacity: 0;
  transform: translateY(3px);
}

.article-heading:not([data-motion-ready]):is(:hover, :focus-within) .article-heading-text {
  --heading-underline: 100%;
}

.article-heading:not([data-motion-ready]):is(:hover, :focus-within) .article-heading-hashes > span {
  opacity: 1;
  transform: none;
}
</style>
