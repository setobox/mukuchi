<script setup lang="ts">
import { computed } from 'vue'
import { mdcBoolean } from '#shared/content/alerts'
import { resolveAlert } from '~/features/alerts/model'
import AppIcon from '../AppIcon.vue'
import BaseCollapsible from '../base/BaseCollapsible.vue'
import '~/features/alerts/palette.css'

const props = withDefaults(defineProps<{
  type?: string
  theme?: string
  title?: string
  collapsible?: boolean | string
  open?: boolean | string
}>(), { collapsible: false, open: false })
const config = useAppConfig()
const alert = computed(() => resolveAlert(props.type, props.theme, config.site.article.alerts?.theme, props.title))
const canCollapse = computed(() => mdcBoolean(props.collapsible))
const initialOpen = computed(() => mdcBoolean(props.open))
</script>

<template>
  <div class="mdc-alert" :data-alert-theme="alert.theme" :data-alert-type="alert.type">
    <BaseCollapsible v-if="canCollapse" :default-open="initialOpen">
      <template #trigger="{ open: expanded }">
        <button type="button" class="mdc-alert-title mdc-alert-trigger">
          <!-- Trusted SVG from checked-in upstream definitions, never article input. -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span class="mdc-alert-icon" aria-hidden="true" v-html="alert.definition.indicator" />
          <span class="mdc-alert-label">{{ alert.title }}</span>
          <AppIcon name="down" class="mdc-alert-fold" :class="{ 'mdc-alert-fold-closed': !expanded }" />
        </button>
      </template>
      <div class="mdc-alert-body">
        <slot />
      </div>
    </BaseCollapsible>
    <template v-else>
      <div class="mdc-alert-title">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span class="mdc-alert-icon" aria-hidden="true" v-html="alert.definition.indicator" />
        <span class="mdc-alert-label">{{ alert.title }}</span>
      </div>
      <div class="mdc-alert-body">
        <slot />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Layout adapted from rehype-callouts 2.2.0; see features/alerts/upstream/LICENSE. */
.mdc-alert {
  /* Reset every inherited theme variable so nested themes remain independent. */
  --alert-color-light: #888;
  --alert-color-dark: #888;
  --alert-border-color: #888;
  --alert-foreground-color-light: var(--color-text);
  --alert-foreground-color-dark: var(--color-text);
  --alert-tone: var(--alert-color-light);
  --alert-foreground: var(--alert-foreground-color-light);
  --alert-title-color: var(--color-heading);
  --alert-icon-size: 1em;
  --alert-title-gap: 8px;
  --alert-body-gap: 1rem;
  min-width: 0;
  width: 100%;
  margin: 1.5rem 0;
  color: var(--color-text);
  font-size: var(--text-m);
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.dark .mdc-alert {
  --alert-tone: var(--alert-color-dark);
  --alert-foreground: var(--alert-foreground-color-dark);
}

.mdc-alert[data-alert-theme='github'] {
  --alert-title-color: var(--alert-tone);
  padding: .5rem 1rem;
  border-inline-start: .25em solid var(--alert-tone);
}

.mdc-alert[data-alert-theme='obsidian'] {
  --alert-title-color: var(--alert-tone);
  --alert-title-gap: 4px;
  --alert-icon-size: 18px;
  padding: 12px 12px 12px 24px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--alert-tone) 10%, transparent);
}

.mdc-alert[data-alert-theme='vitepress'] {
  --alert-title-gap: 6px;
  --alert-icon-size: 16px;
  --alert-body-gap: 8px;
  padding: 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: color-mix(in srgb, var(--alert-tone) 14%, transparent);
  font-size: var(--text-s);
}

.dark .mdc-alert[data-alert-theme='vitepress'] {
  background: color-mix(in srgb, var(--alert-tone) 16%, transparent);
}

.mdc-alert[data-alert-theme='docusaurus'] {
  --alert-title-color: var(--alert-foreground);
  --alert-title-gap: .4em;
  --alert-icon-size: 1.6em;
  --alert-body-gap: .5rem;
  padding: 1rem;
  border-radius: .4rem;
  border-inline-start: 5px solid var(--alert-border-color);
  background: var(--alert-tone);
  color: var(--alert-foreground);
  box-shadow: 0 1px 2px rgb(0 0 0 / .1);
}

.mdc-alert-title {
  display: flex;
  align-items: flex-start;
  gap: var(--alert-title-gap);
  min-width: 0;
  color: var(--alert-title-color);
  font-size: inherit;
  font-weight: 600;
  line-height: 1.5;
}

.mdc-alert-trigger {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: start;
  cursor: pointer;
}

.mdc-alert-trigger:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 4px;
  border-radius: 2px;
}

.mdc-alert-label { min-width: 0; }
.mdc-alert-icon { display: inline-flex; flex: 0 0 auto; align-items: center; height: 1.5em; }
.mdc-alert-icon :deep(svg) { width: var(--alert-icon-size); height: var(--alert-icon-size); }
.mdc-alert-fold { margin-top: .2em; transition: transform 100ms ease-in-out; }
.mdc-alert-fold-closed { transform: rotate(-90deg); }
.mdc-alert-body { display: flow-root; min-width: 0; }
.mdc-alert-body :deep(> :first-child) { margin-top: var(--alert-body-gap); }
.mdc-alert-body :deep(> :last-child) { margin-bottom: 0; }
.mdc-alert-body :deep(> table) { max-width: 100%; overflow-x: auto; }

@media (prefers-reduced-motion: reduce) {
  .mdc-alert-fold { transition: none; }
}
</style>
