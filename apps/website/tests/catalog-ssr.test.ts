import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from 'vite-plus/test'

test('真实 Nuxt SSR：目录查询按请求复用，刷新及失败重试有效', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'newblog-catalog-ssr-'))
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/catalog-ssr/run.ts', import.meta.url)), directory], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      // Build and launch a production server outside Vitest's test environment.
      env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:VITEST|TEST)/.test(key))), NODE_ENV: 'production' },
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024,
    })
    expect(stdout, stderr).toContain('CATALOG_RESULT:')
    const results: { scenario: string, responses: { request: string, status: number, calls: number, html: string }[] }[] = JSON.parse(stdout.split('CATALOG_RESULT:')[1]!)
    for (const { scenario, responses } of results) {
      const expected = scenario === 'refresh-error' ? 3 : ['serial', 'concurrent'].includes(scenario) ? 1 : 2
      for (const { request, status, calls, html } of responses) {
        expect(status, scenario).toBe(200)
        expect(calls, `${scenario}:${request}`).toBe(expected)
        for (const name of ['parent', 'list', 'sidebar'])
          expect(html, `${scenario}:${name}`).toContain(`data-reader="${name}">${request}:${expected}</span>`)
        if (scenario === 'refresh-error')
          expect(html).toContain('query 2 failed')
      }
    }
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 150_000)
