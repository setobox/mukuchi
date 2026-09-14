<script setup lang="ts">
import type { FloatingActionBehavior } from "~/features/floating-actions/registry";
import { getVisibleActions } from "~/features/floating-actions/registry";
import { resolveBackTarget } from "~/shared/navigation";

const page = usePageContext();
const { y } = useWindowScroll();
const { height } = useWindowSize({ initialHeight: 0 });
const reducedMotion = usePreferredReducedMotion();
const previousPath = useState<string | null>("navigation:previous", () => null);
const router = useRouter();
const actions = computed(() =>
  getVisibleActions({ ...page.value, scrollY: y.value, viewportHeight: height.value }),
);

async function execute(behavior: FloatingActionBehavior) {
  if (behavior.type === "navigate") await navigateTo(behavior.to);
  else if (behavior.type === "top")
    window.scrollTo({ top: 0, behavior: reducedMotion.value === "reduce" ? "instant" : "smooth" });
  else {
    const target = resolveBackTarget(previousPath.value, page.value);
    const state: unknown = window.history.state;
    if (
      previousPath.value === target &&
      state &&
      typeof state === "object" &&
      "back" in state &&
      state.back === target
    )
      router.back();
    else await navigateTo(target);
  }
}
</script>

<template>
  <nav
    v-if="actions.length"
    class="fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-[max(16px,env(safe-area-inset-right))] z-actions flex flex-col gap-2 lg:bottom-7 lg:right-7"
    aria-label="页面快捷操作"
  >
    <TransitionGroup name="floating-action"
      ><button
        v-for="action in actions"
        :key="action.id"
        type="button"
        class="grid size-11 place-items-center border border-line-strong rounded-xl bg-acrylic text-muted backdrop-blur-[12px] transition-[color,border-color] duration-160 ease-[ease] hover:border-accent hover:text-accent-soft"
        :aria-label="action.label"
        :title="action.label"
        @click="execute(action.behavior)"
      >
        <AppIcon :name="action.icon" /></button
    ></TransitionGroup>
  </nav>
</template>

<style scoped>
.floating-action-enter-active,
.floating-action-leave-active,
.floating-action-move {
  transition:
    opacity 180ms,
    transform 180ms;
}
.floating-action-enter-from,
.floating-action-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
