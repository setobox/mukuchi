import type { MaybeRefOrGetter } from "vue";
import { createInjectionState } from "@vueuse/core";
import { computed, onMounted, onScopeDispose, shallowRef, toValue } from "vue";

export interface ActionButton {
  id: string;
  icon: `i-${string}`;
  label: string;
  onClick: () => void | Promise<void>;
  order?: number;
  visible?: MaybeRefOrGetter<boolean>;
}

interface RegisteredActionButton extends ActionButton {
  order: number;
  sequence: number;
}

const [useProvideActionButtons, useInjectedActionButtons] = createInjectionState(() => {
  const registeredActions = shallowRef<RegisteredActionButton[]>([]);
  let sequence = 0;

  const actions = computed(() =>
    registeredActions.value.filter((action) => toValue(action.visible ?? true)),
  );

  function registerAction(action: ActionButton): () => void {
    const registeredAction: RegisteredActionButton = {
      ...action,
      order: action.order ?? sequence,
      sequence: sequence++,
    };

    registeredActions.value = [
      ...registeredActions.value.filter((item) => item.id !== action.id),
      registeredAction,
    ].sort((left, right) => left.order - right.order || left.sequence - right.sequence);

    return () => {
      registeredActions.value = registeredActions.value.filter((item) => item !== registeredAction);
    };
  }

  return { actions, registerAction };
});

export { useProvideActionButtons };

export function useActionButtons() {
  const actionButtons = useInjectedActionButtons();
  if (!actionButtons)
    throw new Error("Action buttons must be used below useProvideActionButtons().");
  return actionButtons;
}

export function useActionButton(action: ActionButton): () => void {
  const { registerAction } = useActionButtons();
  let unregister: (() => void) | undefined;
  let stopped = false;

  onMounted(() => {
    if (!stopped) unregister = registerAction(action);
  });

  function stop(): void {
    stopped = true;
    unregister?.();
    unregister = undefined;
  }

  onScopeDispose(stop);
  return stop;
}
