import type { PageContext, SiteSection } from "~/shared/navigation";

const sections: readonly SiteSection[] = ["posts", "categories", "tools", "about"];

export function usePageContext() {
  const route = useRoute();
  return computed<PageContext>(() => {
    const section = sections.find((item) => item === route.meta.section) ?? "posts";
    return {
      path: route.path.replace(/\/$/, "") || "/",
      section,
      title: typeof route.meta.pageTitle === "string" ? route.meta.pageTitle : "mukuchi",
      kind: route.meta.pageKind === "detail" ? "detail" : "index",
      parentPath: typeof route.meta.parentPath === "string" ? route.meta.parentPath : `/${section}`,
    };
  });
}
