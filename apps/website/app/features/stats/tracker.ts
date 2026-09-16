import type { Pageview, RecordedStats } from '../../../shared/stats/model'
import { normalizeStatsPath, uuid, visitorCookie } from '../../../shared/stats/model'

export function ensureVisitorCookie(document: { cookie: string }, baseURL: string, secure: boolean, makeId: () => string) {
  try {
    const read = () => document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${visitorCookie}=`))?.slice(visitorCookie.length + 1)
    const existing = read()
    if (uuid.safeParse(existing).success)
      return
    document.cookie = `${visitorCookie}=${makeId()}; Max-Age=31536000; Path=${baseURL}; SameSite=Lax${secure ? '; Secure' : ''}`
  }
  catch {
    // Browsing and PV collection still work when cookies are blocked.
  }
}

export function createPageviewTracker(options: {
  send: (event: Pageview) => Promise<RecordedStats>
  publish: (result: RecordedStats) => void
  fail: (path: string) => void
  makeId: () => string
  wait: () => Promise<void>
}) {
  let path: string | null = null
  let version = 0
  let stopped = false
  async function open(input: string, force = false) {
    let next: string
    try {
      next = normalizeStatsPath(input)
    }
    catch {
      return
    }
    if (stopped || (!force && next === path))
      return
    path = next
    const current = ++version
    const event = { eventId: options.makeId(), path: next }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await options.send(event)
        if (!stopped && current === version)
          options.publish(result)
        return
      }
      catch (error) {
        const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined
        const retry = status === undefined || status === 0 || (typeof status === 'number' && status >= 500)
        if (attempt === 0 && retry && !stopped && current === version) {
          await options.wait()
          if (stopped || current !== version)
            return
          continue
        }
        if (!stopped && current === version)
          options.fail(next)
        return
      }
    }
  }
  return {
    open,
    leave: () => {
      path = null
      version++
    },
    stop: () => {
      stopped = true
      version++
    },
  }
}
