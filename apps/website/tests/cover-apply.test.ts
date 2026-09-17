import type { CoverApplication } from '../app/features/cover/apply'
import type { Draft } from '../shared/admin/model'
import { expect, test, vi } from 'vite-plus/test'
import { applyGeneratedCover } from '../app/features/cover/apply'
import { imageReferences } from '../server/features/drafts/content'

const source = '---\ntitle: 测试\ndescription: 说明\npublish: 2026-09-16\ncover: /images/old.png\n---\n\n正文\n'
const draft: Draft = { id: 'draft', path: 'test.md', source, version: 1, baseHash: null, publishedVersion: 0, updatedAt: '' }
function setup() {
  const application: CoverApplication = {
    prepare: vi.fn(async () => ({ source, draft })),
    upload: vi.fn(async () => ({ id: 'asset', draftId: draft.id, path: '/images/new.png', mime: 'image/png', size: 10, hash: 'hash', createdAt: '' })),
    current: () => ({ source, version: 1 }),
    save: vi.fn(async (_id, input) => ({ ...draft, source: input.source, version: 2 })),
    commit: vi.fn(),
  }
  return application
}
const image = { blob: new Blob(['png'], { type: 'image/png' }), format: 'png' as const }
test('应用封面只在草稿保存成功后提交，并被现有发布收集器识别', async () => {
  const application = setup()
  await applyGeneratedCover(image, application)
  expect(application.commit).toHaveBeenCalledOnce()
  const saved = vi.mocked(application.commit).mock.calls[0]![0]
  expect(saved.source).toContain('正文')
  expect(saved.source).toContain('cover: /images/new.png')
  expect(await imageReferences(saved.source)).toEqual(new Set(['/images/new.png']))
  expect(application.save).toHaveBeenCalledWith('draft', expect.objectContaining({ version: 1 }))
})
test('上传失败和保存冲突都保留原封面，允许重试', async () => {
  for (const stage of ['upload', 'save'] as const) {
    const application = setup()
    vi.mocked(application[stage]).mockRejectedValueOnce(new Error('失败'))
    await expect(applyGeneratedCover(image, application)).rejects.toThrow('失败')
    expect(application.commit).not.toHaveBeenCalled()
    expect(application.current().source).toBe(source)
    await applyGeneratedCover(image, application)
    expect(application.commit).toHaveBeenCalledOnce()
  }
})
test('超限图片和错误 MIME 不发送上传请求', async () => {
  const application = setup()
  await expect(applyGeneratedCover({ ...image, blob: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }) }, application)).rejects.toThrow('5 MiB')
  await expect(applyGeneratedCover({ ...image, blob: new Blob(['svg'], { type: 'image/svg+xml' }) }, application)).rejects.toThrow('格式')
  expect(application.upload).not.toHaveBeenCalled()
})
test('上传期间文章已改变则不保存过期快照', async () => {
  const application = setup()
  application.current = () => ({ source: `${source}新内容`, version: 2 })
  await expect(applyGeneratedCover(image, application)).rejects.toThrow('文章已修改')
  expect(application.save).not.toHaveBeenCalled()
  expect(application.commit).not.toHaveBeenCalled()
})
