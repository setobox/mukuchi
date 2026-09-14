<script setup lang="ts">
import type { TocLink } from "~/features/toc/model";
const props = defineProps<{
  items: TocLink[];
  activeId: string;
  currentTitle: string;
  mobile?: boolean;
}>();
const open = ref(false);
const desktop = useMediaQuery("(min-width: 1200px)");
const route = useRoute();
const router = useRouter();
let pendingId: string | null = null;
watch(desktop, () => {
  pendingId = null;
  open.value = false;
});
watch(
  () => route.path,
  () => {
    pendingId = null;
    open.value = false;
  },
);
async function jump(id: string) {
  await router.replace({ hash: `#${id}` });
  const target = document.getElementById(id);
  target?.scrollIntoView({ block: "start", behavior: "instant" });
  target?.setAttribute("tabindex", "-1");
  target?.focus({ preventScroll: true });
}
function select(id: string) {
  if (props.mobile && open.value) {
    pendingId = id;
    open.value = false;
  } else void jump(id);
}
function afterClose() {
  if (pendingId) {
    const id = pendingId;
    pendingId = null;
    void jump(id);
  }
}
</script>
<template>
  <template v-if="items.length">
    <div
      v-if="mobile"
      class="fixed inset-x-0 top-[var(--header-height)] z-header border-b border-line bg-acrylic backdrop-blur-xl lg:hidden"
    >
      <button
        type="button"
        class="site-container h-11 flex items-center gap-3 text-left text-sm text-heading"
        :aria-expanded="open"
        aria-haspopup="dialog"
        aria-label="打开文章目录"
        @click="open = true"
      >
        <AppIcon name="toc" /><span class="min-w-0 flex-1 truncate">{{ currentTitle }}</span
        ><AppIcon name="down" />
      </button>
      <AcrylicDialog v-model="open" title="文章目录" placement="toc" @closed="afterClose">
        <TocTree :items="items" :active-id="activeId" @select="select" />
        <template #footer
          ><BaseButton variant="ghost" class="ml-auto" @click="open = false"
            >收起<AppIcon name="up" /></BaseButton
        ></template>
      </AcrylicDialog>
    </div>
    <section v-else class="hidden px-2 lg:block">
      <h2 class="mb-4 text-base text-heading">文章目录</h2>
      <TocTree :items="items" :active-id="activeId" @select="select" />
    </section>
  </template>
</template>
