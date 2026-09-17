import type { IconifyJSON } from '@iconify/types'
import type { IconCollection } from '#shared/cover/icons'
import type { CoverIcon } from './model'
import { getIconData, iconToSVG, quicklyValidateIconSet } from '@iconify/utils'
import { z } from 'zod'
import { localIndexSchema, manifestSchema } from '#shared/cover/icons'
import { sanitizeSvg } from './assets'

export type IconSource = 'local' | 'online'
export interface IconChoice { id: string, icon?: CoverIcon, error?: string }
export const iconPageSize = 48
const api = 'https://api.iconify.design'
const iconId = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/
const remoteInfo = z.object({ name: z.string(), total: z.number().optional(), license: z.object({ title: z.string(), url: z.string().optional() }).optional() })
const remoteCollection = z.object({ uncategorized: z.array(z.string()).optional(), categories: z.record(z.string(), z.array(z.string())).optional(), aliases: z.record(z.string(), z.string()).optional() })
const remoteSearch = z.object({ icons: z.array(z.string()), total: z.number().optional() })

export function iconFromData(data: IconifyJSON, id: string, collection?: IconCollection): CoverIcon {
  const name = id.split(':')[1]!
  const raw = getIconData(data, name)
  if (!raw)
    throw new Error('图标不存在，请选择其他图标。')
  const built = iconToSVG(raw)
  const svg = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${built.attributes.viewBox}">${built.body}</svg>`, undefined, 'iconify')
  return { id, name, svg, monochrome: svg.includes('currentColor'), collection: collection?.name, license: collection?.license }
}

// This cache belongs to one mounted picker. It never stores designs or uploaded files.
export function createIconCatalog(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, unknown>()
  let local: IconCollection[] = []
  let online: IconCollection[] = []
  async function json(url: string, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted()
    if (cache.has(url))
      return cache.get(url)
    let response: Response
    try {
      response = await fetcher(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]), credentials: 'omit' })
    }
    catch (cause) {
      signal.throwIfAborted()
      throw new Error('图标库连接失败或超时，请检查网络后重试。', { cause })
    }
    if (!response.ok)
      throw new Error('图标库加载失败，请检查网络后重试。')
    const value: unknown = await response.json()
    signal.throwIfAborted()
    cache.set(url, value)
    if (cache.size > 128)
      cache.delete(cache.keys().next().value!)
    return value
  }
  async function collections(source: IconSource, signal: AbortSignal) {
    if (!local.length)
      local = manifestSchema.parse(await json('/_cover-icons/manifest.json', signal))
    if (source === 'local')
      return local
    if (!online.length) {
      const raw = z.record(z.string(), remoteInfo).parse(await json(`${api}/collections`, signal))
      online = manifestSchema.parse(Object.entries(raw).map(([prefix, info]) => ({
        prefix,
        name: info.name,
        total: info.total ?? 0,
        license: info.license ? { name: info.license.title, url: /^https?:\/\//.test(info.license.url ?? '') ? info.license.url : undefined } : undefined,
      })))
    }
    return online
  }
  async function index(collection: IconCollection, signal: AbortSignal) {
    return localIndexSchema.parse(await json(`/_cover-icons/${collection.path}/index.json`, signal))
  }
  async function search(source: IconSource, prefix: string, query: string, page: number, signal: AbortSignal) {
    const choices = await collections(source, signal)
    const q = query.trim().toLowerCase()
    if (iconId.test(q)) {
      prefix = q.split(':')[0]!
      if (source === 'online')
        return { ids: page === 0 ? [q] : [], total: 1, hasMore: false }
    }
    const installed = local.find(item => item.prefix === prefix)
    let ids: string[]
    if (source === 'local' || installed) {
      const sets = local.filter(item => !prefix || item.prefix === prefix)
      ids = (await Promise.all(sets.map(async set => Object.keys(await index(set, signal)).map(name => `${set.prefix}:${name}`)))).flat()
      ids = ids.filter(id => q.split(/\s+/).every(part => id.includes(part)))
    }
    else if (q) {
      const start = Math.floor(page / 2) * iconPageSize * 2
      const limit = iconPageSize * 2
      const params = new URLSearchParams({ query: q, limit: String(limit), start: String(start) })
      if (prefix)
        params.set('prefix', prefix)
      const result = remoteSearch.parse(await json(`${api}/search?${params}`, signal))
      const offset = (page % 2) * iconPageSize
      return { ids: result.icons.slice(offset, offset + iconPageSize).filter(id => iconId.test(id)), total: result.icons.length < limit ? start + result.icons.length : null, hasMore: result.icons.length === limit || result.icons.length > offset + iconPageSize }
    }
    else if (prefix) {
      const result = remoteCollection.parse(await json(`${api}/collection?prefix=${encodeURIComponent(prefix)}`, signal))
      ids = [...new Set([...(result.uncategorized ?? []), ...Object.values(result.categories ?? {}).flat()])].map(name => `${prefix}:${name}`)
    }
    else {
      // Online browsing begins with collections; no global download is needed.
      return { ids: [], total: choices.reduce((sum, set) => sum + set.total, 0), hasMore: false }
    }
    if (iconId.test(q) && ids.includes(q))
      ids = [q, ...ids.filter(id => id !== q)]
    return { ids: ids.slice(page * iconPageSize, (page + 1) * iconPageSize), total: ids.length, hasMore: (page + 1) * iconPageSize < ids.length }
  }
  async function icons(ids: string[], signal: AbortSignal): Promise<IconChoice[]> {
    await collections('local', signal)
    const bodies = new Map<string, IconifyJSON>()
    for (const prefix of new Set(ids.map(id => id.split(':')[0]!))) {
      const names = ids.filter(id => id.startsWith(`${prefix}:`) && iconId.test(id)).map(id => id.split(':')[1]!)
      const installed = local.find(set => set.prefix === prefix)
      const remaining = new Set(names)
      if (installed) {
        const lookup = await index(installed, signal)
        const chunks = [...new Set(names.map(name => lookup[name]).filter(value => value !== undefined))]
        await Promise.all(chunks.map(async (chunk) => {
          const data = quicklyValidateIconSet(await json(`/_cover-icons/${installed.path}/${chunk}.json`, signal))
          if (!data)
            throw new Error('图标数据无效。')
          for (const name of names) {
            if (data.icons[name] || data.aliases?.[name]) {
              bodies.set(`${prefix}:${name}`, data)
              remaining.delete(name)
            }
          }
        }))
      }
      if (remaining.size) {
        const params = new URLSearchParams({ icons: [...remaining].join(',') })
        const data = quicklyValidateIconSet(await json(`${api}/${prefix}.json?${params}`, signal))
        if (!data)
          throw new Error('在线图标数据无效。')
        for (const name of remaining) bodies.set(`${prefix}:${name}`, data)
      }
    }
    signal.throwIfAborted()
    return ids.map((id) => {
      try {
        const data = bodies.get(id)
        if (!data)
          throw new Error('图标数据不可用。')
        return { id, icon: iconFromData(data, id, [...local, ...online].find(set => set.prefix === data.prefix)) }
      }
      catch (cause) { return { id, error: cause instanceof Error ? cause.message : '图标不支持静态导出。' } }
    })
  }
  return { collections, search, icons, clear: () => cache.clear() }
}
