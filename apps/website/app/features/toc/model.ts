export interface TocLink {
  id: string;
  text: string;
  depth: number;
  children?: TocLink[];
}
export function flattenToc(links: readonly TocLink[]): TocLink[] {
  return links
    .flatMap((link) => [link, ...flattenToc(link.children ?? [])])
    .filter((link) => link.depth >= 2 && link.depth <= 6);
}
export function activeHeading(
  headings: readonly { id: string; top: number }[],
  offset: number,
  atEnd = false,
): string {
  if (atEnd) return headings.at(-1)?.id ?? "";
  let active = "";
  for (const heading of headings) {
    if (heading.top <= offset + 2) active = heading.id;
    else break;
  }
  return active;
}
