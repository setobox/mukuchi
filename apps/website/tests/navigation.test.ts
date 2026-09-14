import type { PageContext } from "../app/shared/navigation.ts";
import { expect, test } from "vite-plus/test";
import { resolveBackTarget } from "../app/shared/navigation.ts";

const page: PageContext = {
  path: "/posts",
  section: "posts",
  kind: "index",
  title: "文章",
  parentPath: "/posts",
};

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
