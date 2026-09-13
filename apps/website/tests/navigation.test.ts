import { expect, test } from "vite-plus/test";
import {
  getVisibleActions,
  type ActionContext,
} from "../app/features/floating-actions/registry.ts";
import { resolveBackTarget } from "../app/shared/navigation.ts";

const page: ActionContext = {
  path: "/posts",
  section: "posts",
  kind: "index",
  title: "文章",
  parentPath: "/posts",
  scrollY: 0,
  viewportHeight: 800,
};

test("文章列表只在超过半屏后显示回顶", () => {
  expect(getVisibleActions(page)).toEqual([]);
  expect(getVisibleActions({ ...page, scrollY: 400 })).toEqual([]);
  expect(getVisibleActions({ ...page, scrollY: 401 }).map((action) => action.id)).toEqual(["top"]);
});

test("悬浮操作根据页面层级显示，工具返回仅出现在工具详情", () => {
  expect(
    getVisibleActions({ ...page, path: "/about", section: "about" }).map((action) => action.id),
  ).toEqual(["home"]);
  expect(
    getVisibleActions({ ...page, path: "/posts/example", kind: "detail" }).map(
      (action) => action.id,
    ),
  ).toEqual(["home", "back"]);
  expect(
    getVisibleActions({
      ...page,
      path: "/tools/cover",
      section: "tools",
      kind: "detail",
      scrollY: 500,
    }).map((action) => action.id),
  ).toEqual(["home", "tools", "back", "top"]);
});

test("返回优先使用站内来源，直接访问或不安全来源回到所属列表", () => {
  const detail = { ...page, path: "/posts/example" };
  expect(resolveBackTarget("/categories?tag=Vue", detail)).toBe("/categories?tag=Vue");
  for (const source of [
    null,
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/posts/example",
  ]) {
    expect(resolveBackTarget(source, detail)).toBe("/posts");
  }
});
