// @vitest-environment happy-dom
import type { IconifyJSON } from '@iconify/types'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { expect, test, vi } from 'vite-plus/test'
import { createIconCatalog, iconFromData } from '../app/features/cover/catalog'

const require = createRequire(import.meta.url)
const body = '<path fill="currentColor" d="M0 0h24v24H0z"/>'
const data: IconifyJSON = { prefix: 'lucide', icons: { code: { body } }, aliases: { terminal: { parent: 'code', rotate: 1 } }, width: 24, height: 24 }
const manifest = [{ prefix: 'lucide', name: 'Lucide', total: 2, path: 'lucide-test', license: { name: 'ISC' } }]
const signal = () => new AbortController().signal
function mockCatalog(remote: (url: string) => unknown = () => ({})) {
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    const value = url.endsWith('manifest.json') ? manifest : url.endsWith('index.json') ? { code: 0, terminal: 0 } : url.endsWith('/0.json') ? data : remote(url)
    return new Response(JSON.stringify(value), { status: 200 })
  })
  return { fetcher, catalog: createIconCatalog(fetcher) }
}

test('完整 Lucide 与 Logos 数据可解析，仅拒绝上游损坏的内部引用', async () => {
  const failures: string[] = []
  for (const prefix of ['lucide', 'logos']) {
    const collection = JSON.parse(await readFile(require.resolve(`@iconify-json/${prefix}/icons.json`), 'utf8')) as IconifyJSON
    expect(Object.keys(collection.icons).length).toBeGreaterThan(1000)
    for (const name of [...Object.keys(collection.icons), ...Object.keys(collection.aliases ?? {})]) {
      try {
        expect(iconFromData(collection, `${prefix}:${name}`).svg).toContain('viewBox=')
      }
      catch (error) { failures.push(`${prefix}:${name}: ${error instanceof Error ? error.message : error}`) }
    }
  }
  // This upstream icon contains fill="url(#patternwaffle-pattern-1" (missing ')').
  expect(failures).toEqual(['logos:waffle-icon: SVG 不能引用外部资源。'])
}, 30000)

test('本地图标按需分块、命中缓存并正确展开别名', async () => {
  const { catalog, fetcher } = mockCatalog()
  const result = await catalog.search('local', '', 'lucide:terminal', 0, signal())
  expect(result.ids).toEqual(['lucide:terminal'])
  expect((await catalog.search('local', 'logos', 'lucide:terminal', 0, signal())).ids).toEqual(['lucide:terminal'])
  const [choice] = await catalog.icons(result.ids, signal())
  expect(choice?.icon?.svg).toContain('rotate(90')
  expect(choice?.icon?.monochrome).toBe(true)
  await catalog.icons(result.ids, signal())
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/0.json'))).toHaveLength(1)
  expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('/_cover-icons/'))).toBe(true)
})

test('在线选择优先本地数据，彩色图标保持原色且拒绝动画', async () => {
  const { catalog, fetcher } = mockCatalog(() => ({}))
  await catalog.collections('online', signal())
  await catalog.icons(['lucide:code'], signal())
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('lucide.json'))).toBe(false)
  const color = iconFromData({ prefix: 'brand', icons: { color: { body: '<path fill="#ff0000" d="M0 0h16v16z"/>' } } }, 'brand:color')
  expect(color.monochrome).toBe(false)
  expect(color.svg).toContain('#ff0000')
  expect(() => iconFromData({ prefix: 'test', icons: { animated: { body: '<animate attributeName="x"/>' } } }, 'test:animated')).toThrow('静态')
})

test('图标库请求失败可重试，过期响应在取消后不能进入结果或缓存', async () => {
  let resolve: (value: Response) => void = () => {}
  const fetcher = vi.fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done }))
    .mockResolvedValue(new Response(JSON.stringify(manifest)))
  const catalog = createIconCatalog(fetcher)
  await expect(catalog.collections('local', signal())).rejects.toThrow('连接失败')
  const controller = new AbortController()
  const old = catalog.collections('local', controller.signal)
  controller.abort()
  resolve(new Response(JSON.stringify([])))
  await expect(old).rejects.toThrow()
  expect(await catalog.collections('local', signal())).toEqual(manifest)
  expect(fetcher).toHaveBeenCalledTimes(3)
})

test('在线搜索总数是当前批次数量，分页保留下一批并复用已加载结果', async () => {
  const { catalog, fetcher } = mockCatalog(url => url.includes('/collections') ? {} : { icons: Array.from({ length: 96 }, (_, i) => `test:icon-${i}`), total: 96 })
  const first = await catalog.search('online', '', 'icon', 0, signal())
  const second = await catalog.search('online', '', 'icon', 1, signal())
  expect(first.total).toBeNull()
  expect(first.hasMore).toBe(true)
  expect(first.ids).toHaveLength(48)
  expect(second.ids[0]).toBe('test:icon-48')
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/search?'))).toHaveLength(1)
})
