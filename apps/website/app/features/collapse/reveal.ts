export const collapseRevealEvent = 'mukuchi:reveal-collapse'
interface RevealRequest { waitUntil: (pending: Promise<void>) => void }

export function isCollapseRevealEvent(event: Event): event is CustomEvent<RevealRequest> {
  return event instanceof CustomEvent && event.type === collapseRevealEvent
    && typeof event.detail?.waitUntil === 'function'
}

/** Ask all enclosing regions to open, without a global component registry. */
export async function revealContent(target: HTMLElement): Promise<boolean> {
  const pending: Promise<void>[] = []
  target.dispatchEvent(new CustomEvent<RevealRequest>(collapseRevealEvent, {
    bubbles: true,
    detail: { waitUntil: promise => pending.push(promise) },
  }))
  await Promise.all(pending)
  return target.isConnected && !target.closest('[inert], [hidden]')
}

export function findHashTarget(hash: string): HTMLElement | null {
  if (!hash.startsWith('#') || hash.length < 2)
    return null
  try {
    return document.getElementById(decodeURIComponent(hash.slice(1)))
  }
  catch {
    return null
  }
}
