import { afterEach, expect, test, vi } from 'vite-plus/test'
import { parseMilanoteCollections } from '../server/features/collections/parser'

const detail = (children: unknown[]) => ({ ok: true, data: { board: { children } } })
const board = (title: string, children: unknown[]) => ({ type: 'BOARD', title, children })
const link = (fields: Record<string, unknown> = {}) => ({ type: 'LINK', url: 'https://www.example.com', ...fields })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

test('收藏保留分组和条目顺序、空分组，清理空白并按提供方及域名回退标题', () => {
  expect(parseMilanoteCollections(detail([
    board('  开发\n 工具 ', [
      link({ title: '  文档\n 入口 ', caption: { plainText: ' 快速\t查阅 ' }, faviconUrl: 'https://example.com/icon.png' }),
      link({ title: ' ', provider: { display: ' 提供\n 方 ' } }),
      link(),
    ]),
    board('空分组', []),
  ]))).toEqual([
    { title: '开发 工具', items: [
      { title: '文档 入口', description: '快速 查阅', href: 'https://www.example.com', imageUrl: 'https://example.com/icon.png' },
      { title: '提供 方', description: '', href: 'https://www.example.com', imageUrl: undefined },
      { title: 'example.com', description: '', href: 'https://www.example.com', imageUrl: undefined },
    ] },
    { title: '空分组', items: [] },
  ])
})

test('跳过无效节点和非 HTTP(S) 外链，无效图标不丢弃有效条目', () => {
  const groups = parseMilanoteCollections(detail([
    null,
    { type: 'NOTE' },
    board('资源', [
      null,
      { type: 'NOTE' },
      link({ url: 'broken' }),
      link({ url: 'javascript:alert(1)' }),
      link({ url: 'data:text/html,hello' }),
      link({ url: 'ftp://example.com' }),
      link({ faviconUrl: 'broken' }),
      link({ faviconUrl: 'data:image/svg+xml,hello' }),
      link({ url: 'http://example.com', faviconUrl: null }),
    ]),
  ]))
  expect(groups).toHaveLength(1)
  expect(groups[0]!.items).toHaveLength(3)
  expect(groups[0]!.items.every(item => item.imageUrl === undefined)).toBe(true)
})

test('空看板返回空数组，整体协议错误抛出异常', () => {
  expect(parseMilanoteCollections(detail([]))).toEqual([])
  for (const value of [null, {}, { ok: false }, { ok: true, data: { board: { children: null } } }])
    expect(() => parseMilanoteCollections(value)).toThrow()
})

async function route() {
  const fetcher = vi.fn().mockResolvedValue(detail([board('资源', [link()])]))
  const cached = vi.fn((handler: () => Promise<unknown>) => handler)
  vi.stubGlobal('$fetch', fetcher)
  vi.stubGlobal('defineCachedEventHandler', cached)
  vi.stubGlobal('createError', (value: object) => Object.assign(new Error('Bad gateway'), value))
  const { default: handler } = await import('../server/api/collections.get')
  return { fetcher, cached, invoke: handler as unknown as () => Promise<unknown> }
}

test('接口使用固定看板、超时及缓存策略，成功返回规范化数据', async () => {
  const { fetcher, cached, invoke } = await route()
  expect(await invoke()).toEqual([{ title: '资源', items: [{ title: 'example.com', description: '', href: 'https://www.example.com', imageUrl: undefined }] }])
  expect(fetcher).toHaveBeenCalledWith('https://mn.setobox.me/api/detail', {
    query: {
      url: 'https://app.milanote.com/1WOTjb1OxP4xfc?p=3Ok1zpJfWiB',
      exclude: '**.location,**.timestamps,board.color,board.id,board.title,board.type,fetchedAt,source,source.boardId,source.provider,version',
    },
    retry: 0,
    timeout: 5_000,
  })
  expect(cached).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ maxAge: 3600, staleMaxAge: 86400, swr: true }))
})

test.each(['timeout', 'network', 'invalid'])('上游 %s 失败返回 502，保留错误原因', async (failure) => {
  const { fetcher, invoke } = await route()
  const cause = new Error(failure)
  if (failure === 'invalid')
    fetcher.mockResolvedValue({ ok: false })
  else
    fetcher.mockRejectedValue(cause)
  await expect(invoke()).rejects.toMatchObject({ statusCode: 502, cause: failure === 'invalid' ? expect.any(Error) : cause })
  expect(fetcher).toHaveBeenCalledOnce()
})
