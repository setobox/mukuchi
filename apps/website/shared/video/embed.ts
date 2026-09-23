export type VideoProvider = 'bilibili' | 'youtube'

export interface VideoInput {
  id?: unknown
  src?: unknown
  p?: unknown
  start?: unknown
}

export interface VideoEmbed {
  provider: VideoProvider
  id: string
  src: string
  href: string
}

const identifiers = {
  bilibili: /^BV[A-Za-z\d]{10}$/,
  youtube: /^[\w-]{11}$/,
}

function videoUrl(value: unknown): URL | null {
  if (typeof value !== 'string')
    return null
  try {
    const url = new URL(value.trim())
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.port ? url : null
  }
  catch { return null }
}

function sourceId(provider: VideoProvider, url: URL): string | null {
  if (provider === 'bilibili') {
    if (url.hostname === 'player.bilibili.com' && url.pathname === '/player.html')
      return url.searchParams.get('bvid')
    if (['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname))
      return url.pathname.match(/^\/video\/(BV[A-Za-z\d]{10})\/?$/)?.[1] ?? null
    return null
  }

  if (['youtu.be', 'www.youtu.be'].includes(url.hostname))
    return url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1] ?? null
  if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname))
    return url.pathname.match(/^\/embed\/([\w-]{11})\/?$/)?.[1] ?? null
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch')
      return url.searchParams.get('v')
    return url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/)?.[1] ?? null
  }
  return null
}

function integer(value: unknown, fallback: number, minimum = 0): number | null {
  if (value === undefined || value === null)
    return fallback
  if ((typeof value !== 'string' || !/^\d+$/.test(value)) && typeof value !== 'number')
    return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= minimum ? number : null
}

function seconds(value: unknown): number | null {
  const parts = typeof value === 'string' && value ? value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/) : null
  if (parts) {
    return integer(Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0), 0)
  }
  return integer(value, 0)
}

// Rebuild trusted player URLs instead of forwarding arbitrary iframe URLs or query parameters.
export function resolveVideo(provider: VideoProvider, input: VideoInput): VideoEmbed | null {
  const url = input.id === undefined ? videoUrl(input.src) : null
  const id = typeof input.id === 'string' ? input.id.trim() : url ? sourceId(provider, url) : null
  if (!id || !identifiers[provider].test(id))
    return null

  const start = seconds(input.start ?? url?.searchParams.get('start') ?? url?.searchParams.get('t'))
  if (start === null)
    return null

  if (provider === 'bilibili') {
    const p = integer(input.p ?? url?.searchParams.get('p'), 1, 1)
    if (p === null)
      return null
    const src = new URL('https://player.bilibili.com/player.html')
    src.search = new URLSearchParams({ bvid: id, p: String(p), autoplay: '0' }).toString()
    const href = new URL(`https://www.bilibili.com/video/${id}/`)
    if (p > 1)
      href.searchParams.set('p', String(p))
    if (start > 0) {
      src.searchParams.set('t', String(start))
      href.searchParams.set('t', String(start))
    }
    return { provider, id, src: src.href, href: href.href }
  }

  const src = new URL(`https://www.youtube-nocookie.com/embed/${id}`)
  src.search = new URLSearchParams({ autoplay: '0', playsinline: '1' }).toString()
  const href = new URL('https://www.youtube.com/watch')
  href.searchParams.set('v', id)
  if (start > 0) {
    src.searchParams.set('start', String(start))
    href.searchParams.set('t', `${start}s`)
  }
  return { provider, id, src: src.href, href: href.href }
}
