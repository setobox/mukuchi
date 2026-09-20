import { expect, test } from 'vite-plus/test'
import { formatFileSize, imageHeaderInfo, validateImageFile, validImageAddress } from '../shared/admin/media'
import { imageLimit } from '../shared/admin/model'

test('上传前提示实际文件大小，接受上限且拒绝空文件、超限和不支持的格式', () => {
  expect(formatFileSize(0)).toBe('0 B')
  expect(formatFileSize(1536)).toBe('1.5 KiB')
  expect(formatFileSize(imageLimit)).toBe('5.00 MiB')
  expect(formatFileSize(null)).toBe('大小未知')
  expect(() => validateImageFile({ size: imageLimit, type: 'image/webp' })).not.toThrow()
  expect(() => validateImageFile({ size: 0, type: 'image/png' })).toThrow('非空')
  expect(() => validateImageFile({ size: imageLimit + 1, type: 'image/png' })).toThrow('5 MiB')
  expect(() => validateImageFile({ size: 1024, type: 'image/svg+xml' })).toThrow('PNG')
})

test('封面地址仅允许网站路径与无凭据 HTTP(S) 地址', () => {
  expect(validImageAddress('/images/封面.png')).toBe(true)
  expect(validImageAddress('https://example.com/cover.webp?v=1')).toBe(true)
  for (const address of ['//example.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,x', 'https://name:secret@example.com/a', '/images/a b.png', '/\\example.com/image.png'])
    expect(validImageAddress(address)).toBe(false)
})

test('外链响应未提供可用长度或类型时明确返回未知，不将空响应头当成零字节', () => {
  expect(imageHeaderInfo(new Headers({ 'content-length': '2048', 'content-type': 'image/webp; charset=binary' }))).toEqual({ size: 2048, mime: 'image/webp' })
  expect(imageHeaderInfo(new Headers())).toEqual({ size: null, mime: '' })
  expect(imageHeaderInfo(new Headers({ 'content-length': '0', 'content-type': 'text/html' }))).toEqual({ size: null, mime: '' })
})
