import { expect, test } from 'vite-plus/test'
import { assertSmokeStatus } from '../scripts/lib/http'

const url = new URL('https://example.com/categories/Blender?tag=missing&category=missing')

test('503 验收失败保留 Cloudflare CPU 超限说明和 Ray ID', async () => {
  const body = '<title>Worker exceeded resource limits</title><style>private-style</style><h1>Error <span>1102</span></h1><script>private-script</script>'
  const response = new Response(body, { status: 503, headers: { 'server': 'cloudflare', 'cf-ray': 'test-ray-DFW', 'set-cookie': 'private-cookie' } })
  const error = await assertSmokeStatus(response, 200, url).catch((error: unknown) => error)
  expect(error).toMatchObject({ actual: 503, expected: 200 })
  expect((error as Error).message).toContain(url.href)
  expect((error as Error).message).toContain('test-ray-DFW')
  expect((error as Error).message).toContain('Worker exceeded resource limits')
  expect((error as Error).message).toContain('1102')
  expect((error as Error).message).not.toMatch(/private-(?:cookie|script|style)/)
  expect(await response.text()).toBe(body)
})

test.each([200, 302, 404])('预期状态 %s 原样通过，响应正文仍可用于后续验收', async (status) => {
  const response = new Response('page content', { status })
  await assertSmokeStatus(response, status, url)
  expect(await response.text()).toBe('page content')
})

test('错误摘要限制长度，正文读取失败也保留状态与请求信息', async () => {
  const response = new Response('x'.repeat(10_000), { status: 500 })
  await expect(assertSmokeStatus(response, 200, url)).rejects.toThrow('x'.repeat(1500))
  await expect(assertSmokeStatus(response, 200, url)).rejects.not.toThrow('x'.repeat(1501))
  await response.text()
  await expect(assertSmokeStatus(response, 200, url)).rejects.toThrow('无法读取错误响应')
})
