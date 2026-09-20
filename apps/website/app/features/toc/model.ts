export interface TocLink {
  id: string
  text: string
  depth: number
  children?: TocLink[]
}

export type ContentTocLink = TocLink
export interface ContentTocProps {
  links?: ContentTocLink[]
  title?: string
  highlight?: boolean
  highlightVariant?: 'straight' | 'circuit'
  open?: boolean
  defaultOpen?: boolean
  /** Number of rows kept visible when collapsed on small screens. */
  collapsedRows?: number
  /** Use a dialog's scroll viewport without changing the editor route hash. */
  scrollRoot?: HTMLElement | null
  layout?: 'viewport' | 'container'
}

// Adapted from Nuxt UI v4.6.0 ContentToc (MIT); see THIRD_PARTY_NOTICES.md.
// Keep this in sync with the component's leading-5 and py-1.
export const tocLinkHeight = 1.75

export function tocPreviewHeight(links: readonly TocLink[], rows: number): number {
  const count = Number.isFinite(rows) ? Math.max(0, Math.floor(rows)) : 0
  return Math.min(flattenToc(links).length, count) * tocLinkHeight
}

export function flattenToc(links: readonly TocLink[], level = 0): { link: TocLink, level: number }[] {
  return links.flatMap(link => [
    { link, level },
    ...flattenToc(link.children ?? [], level + 1),
  ])
}

export function circuitMask(links: readonly TocLink[]) {
  const flatLinks = flattenToc(links)
  if (!flatLinks.length)
    return undefined

  const rowHeight = tocLinkHeight * 16
  const trackX = (level: number) => level > 0 ? 10.5 : 0.5
  let path = ''
  let currentX = 0.5
  flatLinks.forEach(({ level }, index) => {
    const targetX = trackX(level)
    const y = index * rowHeight
    if (index === 0) {
      path = `M${targetX} ${y}`
      currentX = targetX
    }
    if (targetX !== currentX) {
      path += ` L${targetX} ${y + 6}`
      currentX = targetX
    }
    const next = flatLinks[index + 1]
    // Deeper descendants share the inner track, so only actual track changes bend.
    const bend = next && trackX(next.level) !== currentX ? 6 : 0
    path += ` L${currentX} ${y + rowHeight - bend}`
  })
  const svg = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 ${flatLinks.length * rowHeight}'><path d='${path}' stroke='black' stroke-width='1' fill='none'/></svg>`)
  return {
    width: '0.75rem',
    height: `${flatLinks.length * tocLinkHeight}rem`,
    maskImage: `url("data:image/svg+xml,${svg}")`,
    maskRepeat: 'no-repeat',
    maskSize: '100% 100%',
  }
}
