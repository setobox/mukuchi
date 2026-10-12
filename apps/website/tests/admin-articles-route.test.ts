import type { H3Event } from 'h3'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { adminRoute } from '../server/features/admin/routes'

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), files: vi.fn(), drafts: vi.fn(), rows: vi.fn() }))
vi.mock('#admin-preview-highlighter', () => ({ default: undefined }))
vi.mock('../server/features/auth/session', () => ({ requireOwner: mocks.authorize }))
vi.mock('../server/features/publishing/service', () => ({ githubClient: () => ({ list: mocks.files }), publishDraft: vi.fn(), publicationStatus: vi.fn() }))
vi.mock('../server/features/admin/http', () => ({ withAdmin: (_event: unknown, action: (repo: { drafts: typeof mocks.drafts }) => unknown) => action({ drafts: mocks.drafts }), adminOptions: vi.fn(), adminStorage: vi.fn(), readAdminJson: vi.fn(), readLimitedBody: vi.fn() }))
vi.mock('../server/features/admin/article-list', () => ({ listArticleRows: mocks.rows }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

test.each(['rows', undefined])('文章列表 view=%s 保留行数据，精简模式不返回重复草稿正文', async (view) => {
  const source = '---\ntitle: 标题\n---\n正文'
  const draft = { id: 'draft', path: 'a.md', source, version: 1 }
  const rows = [{ path: 'a.md', title: '标题', draft: { id: 'draft', version: 1 } }]
  mocks.files.mockResolvedValue([{ path: 'a.md', hash: 'hash', source }])
  mocks.drafts.mockResolvedValue([draft])
  mocks.rows.mockResolvedValue(rows)
  vi.stubGlobal('getRouterParam', () => 'articles')
  vi.stubGlobal('getQuery', () => ({ view }))
  const result = await adminRoute({ method: 'GET' } as H3Event)
  expect(mocks.authorize).toHaveBeenCalledOnce()
  expect(result).toMatchObject({ rows })
  if (view === 'rows') {
    expect(result).not.toHaveProperty('articles')
    expect(result).not.toHaveProperty('drafts')
    expect(JSON.stringify(result)).not.toContain('正文')
  }
  else {
    expect(result).toMatchObject({ drafts: [draft], articles: [{ path: 'a.md', draft, title: '标题' }] })
  }
})

test('精简列表同样先鉴权，未授权时不读取文章或草稿', async () => {
  mocks.authorize.mockRejectedValue(new Error('未登录'))
  await expect(adminRoute({ method: 'GET' } as H3Event)).rejects.toThrow('未登录')
  expect(mocks.files).not.toHaveBeenCalled()
  expect(mocks.drafts).not.toHaveBeenCalled()
  expect(mocks.rows).not.toHaveBeenCalled()
})
