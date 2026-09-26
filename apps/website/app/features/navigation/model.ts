import type { IconName } from '../../shared/icons'
import type { PageContext, SiteSection } from '../../shared/navigation'

interface NavigationIdentity {
  id: string
  enabled?: boolean
}

export interface NavigationDestination extends NavigationIdentity {
  label: string
  icon: IconName
  to: `/${string}`
  description?: string
  sections: readonly SiteSection[]
}

export interface NavigationLink extends NavigationDestination {
  kind: 'link'
}

export interface NavigationFolder extends NavigationDestination {
  kind: 'folder'
  children: readonly NavigationLink[]
}

export interface NavigationSwitcher extends NavigationIdentity {
  kind: 'switcher'
  defaultChildId: string
  children: readonly NavigationLink[]
}

export type NavigationItem = NavigationLink | NavigationFolder | NavigationSwitcher
export interface ResolvedNavigationLink extends NavigationDestination {
  active: boolean
  current?: 'page' | 'location'
}
export interface ResolvedNavigationItem extends ResolvedNavigationLink {
  kind: NavigationItem['kind']
  children: readonly ResolvedNavigationLink[]
}

function resolveLink(link: NavigationDestination, page: PageContext): ResolvedNavigationLink {
  const active = link.sections.includes(page.section)
  const exact = link.to.replace(/\/$/, '') === page.path.replace(/\/$/, '')
  return { ...link, active, current: exact ? 'page' : active ? 'location' : undefined }
}

/** Resolve only available destinations, including the switcher's fallback. */
export function resolveNavigation(items: readonly NavigationItem[], page: PageContext): ResolvedNavigationItem[] {
  return items.filter(item => item.enabled !== false).flatMap((item): ResolvedNavigationItem[] => {
    if (item.kind === 'link')
      return [{ ...resolveLink(item, page), kind: item.kind, children: [] }]
    const children = item.children.filter(child => child.enabled !== false).map(child => resolveLink(child, page))
    if (item.kind === 'switcher') {
      const selected = children.find(child => child.active)
        ?? children.find(child => child.id === item.defaultChildId)
        ?? children[0]
      const active = item.children.some(child => child.sections.includes(page.section))
      return selected ? [{ ...selected, id: item.id, kind: item.kind, active, children }] : []
    }
    const link = resolveLink(item, page)
    return [{ ...link, kind: item.kind, active: link.active || children.some(child => child.active), children }]
  })
}

/** A switcher contributes its children, a folder also contributes its own page. */
export function navigationDestinations(items: readonly NavigationItem[]): NavigationDestination[] {
  return items.filter(item => item.enabled !== false).flatMap((item): NavigationDestination[] => {
    if (item.kind === 'link')
      return [item]
    const children = item.children.filter(child => child.enabled !== false)
    return item.kind === 'folder' ? [item, ...children] : children
  })
}
