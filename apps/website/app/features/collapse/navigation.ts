import type { RouterScrollBehavior } from 'vue-router'
import { findHashTarget, revealContent } from './reveal'

/** Initial router scrolling can run before client plugins and hydration. */
export async function restoreCollapsedHash(hash: string, isCurrent: () => boolean): Promise<boolean> {
  const target = findHashTarget(hash)
  if (!target?.closest('[data-collapsible-content][inert]'))
    return false
  if (!await revealContent(target) || !isCurrent())
    return false
  target.scrollIntoView({ block: 'start', behavior: 'instant' })
  return true
}

/** Preserve Nuxt's page readiness and history scrolling around hidden headings. */
export function withCollapsibleAnchors(
  original: RouterScrollBehavior | undefined,
  isCurrent: (fullPath: string) => boolean,
  ready: () => Promise<void>,
): RouterScrollBehavior {
  return async (to, from, saved) => {
    if (to.hash)
      await ready()
    const position = await original?.(to, from, saved)
    if (!to.hash)
      return position ?? false
    if (!isCurrent(to.fullPath))
      return false
    const target = findHashTarget(to.hash)
    if (!target?.closest('[data-collapsible-content]'))
      return position ?? false
    if (!await revealContent(target) || !isCurrent(to.fullPath))
      return false
    if (saved || position === false)
      return position ?? saved ?? false
    return {
      el: target,
      top: (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
        + (Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0),
      behavior: 'instant',
    }
  }
}
