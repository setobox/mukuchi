import type { IconName } from "../../shared/icons.ts";
import type { PageContext } from "../../shared/navigation.ts";

export interface ActionContext extends PageContext {
  scrollY: number;
  viewportHeight: number;
}
export type FloatingActionBehavior =
  | { type: "navigate"; to: string }
  | { type: "back" }
  | { type: "top" };
export interface FloatingAction {
  id: string;
  label: string;
  icon: IconName;
  order: number;
  visible: (context: ActionContext) => boolean;
  behavior: FloatingActionBehavior;
}

export const floatingActions: readonly FloatingAction[] = [
  {
    id: "home",
    label: "返回文章列表",
    icon: "home",
    order: 10,
    visible: ({ path }) => path !== "/posts",
    behavior: { type: "navigate", to: "/posts" },
  },
  {
    id: "tools",
    label: "返回工具列表",
    icon: "shapes",
    order: 20,
    visible: ({ section, kind }) => section === "tools" && kind === "detail",
    behavior: { type: "navigate", to: "/tools" },
  },
  {
    id: "back",
    label: "返回上一页",
    icon: "left",
    order: 30,
    visible: ({ kind }) => kind === "detail",
    behavior: { type: "back" },
  },
  {
    id: "top",
    label: "回到顶部",
    icon: "up",
    order: 40,
    visible: ({ scrollY, viewportHeight }) => viewportHeight > 0 && scrollY > viewportHeight * 0.5,
    behavior: { type: "top" },
  },
];

export function getVisibleActions(
  context: ActionContext,
  registry: readonly FloatingAction[] = floatingActions,
): FloatingAction[] {
  return registry.filter((action) => action.visible(context)).toSorted((a, b) => a.order - b.order);
}
