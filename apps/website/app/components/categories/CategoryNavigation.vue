<script setup lang="ts">
import { visibleCategoryCount } from "~/features/categories/overflow";
const props = defineProps<{
  categories: { name: string; count: number }[];
  selected: string;
  tag: string;
}>();
const container = useTemplateRef<HTMLElement>("container");
const measurement = useTemplateRef<HTMLElement>("measurement");
const moreButton = useTemplateRef<HTMLButtonElement>("moreButton");
const popup = useTemplateRef<HTMLElement>("popup");
const popupId = useId();
const visibleCount = ref(0);
const open = ref(false);
const overflow = computed(() => props.categories.slice(visibleCount.value));
const selectedOverflow = computed(() =>
  overflow.value.some((category) => category.name === props.selected),
);
function location(category = "") {
  return {
    path: "/categories",
    query: { category: category || undefined, tag: props.tag || undefined },
  };
}
function measure() {
  if (!container.value || !measurement.value) return;
  const widths = Array.from(
    measurement.value.children,
    (element) => element.getBoundingClientRect().width,
  );
  visibleCount.value = visibleCategoryCount(
    widths.slice(2),
    container.value.clientWidth,
    widths[0] ?? 0,
    widths[1] ?? 0,
    Number.parseFloat(getComputedStyle(measurement.value).columnGap),
  );
  if (!overflow.value.length) open.value = false;
}
function close(focus = false) {
  open.value = false;
  if (focus) moreButton.value?.focus();
}
useResizeObserver(container, measure);
watch(
  () => props.categories,
  () => nextTick(measure),
  { deep: true },
);
watch(
  () => [props.selected, props.tag],
  () => close(),
);
watch(open, async (value) => {
  if (value) {
    await nextTick();
    const target =
      popup.value?.querySelector<HTMLAnchorElement>('a[aria-current="page"]') ??
      popup.value?.querySelector<HTMLAnchorElement>("a");
    target?.focus();
  }
});
onMounted(async () => {
  await document.fonts.ready;
  measure();
});
onClickOutside(container, () => close());
</script>
<template>
  <nav
    ref="container"
    class="relative min-w-0"
    aria-label="专栏分类"
    @keydown.esc.prevent="open && close(true)"
    @focusout="
      (event) => {
        if (!container?.contains(event.relatedTarget as Node)) close();
      }
    "
  >
    <div
      ref="measurement"
      class="pointer-events-none invisible absolute inset-x-0 top-0 flex gap-2 overflow-hidden"
      aria-hidden="true"
    >
      <span
        class="min-h-11 inline-flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 font-medium"
        >全部文章</span
      >
      <span
        class="min-h-11 inline-flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 font-medium"
        >更多<AppIcon name="down"
      /></span>
      <span
        v-for="category in categories"
        :key="category.name"
        class="min-h-11 inline-flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 font-medium"
        >{{ category.name
        }}<span class="shrink-0 text-sm font-mono">{{ category.count }}</span></span
      >
    </div>
    <div class="flex gap-2">
      <NuxtLink
        :to="location()"
        class="min-h-11 inline-flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 font-medium transition-colors duration-180"
        :class="
          !selected
            ? 'bg-accent-surface text-accent-soft'
            : 'text-muted hover:bg-surface hover:text-heading'
        "
        :aria-current="!selected ? 'page' : undefined"
        >全部文章</NuxtLink
      >
      <NuxtLink
        v-for="category in categories.slice(0, visibleCount)"
        :key="category.name"
        :to="location(category.name)"
        class="min-h-11 inline-flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 font-medium transition-colors duration-180"
        :class="
          selected === category.name
            ? 'bg-accent-surface text-accent-soft'
            : 'text-muted hover:bg-surface hover:text-heading'
        "
        :aria-current="selected === category.name ? 'page' : undefined"
        >{{ category.name
        }}<span class="shrink-0 text-sm font-mono">{{ category.count }}</span></NuxtLink
      >
      <button
        v-if="overflow.length"
        ref="moreButton"
        type="button"
        class="min-h-11 inline-flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 font-medium transition-colors duration-180"
        :class="
          selectedOverflow
            ? 'bg-accent-surface text-accent-soft'
            : open
              ? 'bg-surface text-heading'
              : 'text-muted hover:bg-surface hover:text-heading'
        "
        :aria-expanded="open"
        :aria-controls="popupId"
        :aria-label="selectedOverflow ? `更多专栏，当前专栏：${selected}` : '更多专栏'"
        @click="open = !open"
      >
        更多<AppIcon
          name="down"
          class="transition-transform duration-180"
          :class="{ 'rotate-180': open }"
        />
      </button>
    </div>
    <Transition
      enter-active-class="transition duration-180 ease-out"
      leave-active-class="transition duration-180 ease-in"
      enter-from-class="translate-y-1 opacity-0"
      leave-to-class="translate-y-1 opacity-0"
    >
      <div
        v-show="open"
        :id="popupId"
        ref="popup"
        :inert="!open"
        class="absolute right-0 top-[calc(100%+8px)] z-20 max-h-[min(60dvh,28rem)] max-w-full w-72 overflow-y-auto border border-line-strong rounded-panel bg-acrylic p-2 shadow-lg backdrop-blur-xl"
      >
        <NuxtLink
          v-for="category in overflow"
          :key="category.name"
          :to="location(category.name)"
          class="min-h-11 flex items-center justify-between gap-4 rounded-lg px-3.5 py-2 font-medium transition-colors duration-180"
          :class="
            selected === category.name
              ? 'bg-accent-surface text-accent-soft'
              : 'text-muted hover:bg-surface hover:text-heading'
          "
          :aria-current="selected === category.name ? 'page' : undefined"
          @click="close()"
          ><span class="min-w-0 break-words">{{ category.name }}</span
          ><span class="shrink-0 text-sm font-mono">{{ category.count }}</span></NuxtLink
        >
      </div>
    </Transition>
  </nav>
</template>
