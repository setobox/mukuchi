import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

const build = z.object({ enabled: z.boolean() }).parse(JSON.parse(readFileSync('.output/audio-build.json', 'utf8')))
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)])
}
const worker = '.output/server/wrangler.json'
if (existsSync(worker)) {
  const config = z.object({ main: z.string(), r2_buckets: z.array(z.object({ binding: z.string() })).optional(), workflows: z.array(z.object({ binding: z.string(), class_name: z.string() })).optional(), triggers: z.object({ crons: z.array(z.string()) }).optional(), vars: z.record(z.string(), z.unknown()) }).parse(JSON.parse(readFileSync(worker, 'utf8')))
  assert.equal(config.r2_buckets?.some(bucket => bucket.binding === 'AUDIO_ASSETS') ?? false, build.enabled)
  assert.equal(config.workflows?.some(workflow => workflow.binding === 'ARTICLE_AUDIO_WORKFLOW' && workflow.class_name === 'ArticleAudioWorkflow') ?? false, build.enabled)
  assert.equal(config.triggers?.crons.includes('*/5 * * * *') ?? false, build.enabled)
  assert.equal(config.vars.NUXT_AUDIO_ENABLED, String(build.enabled))
  const entry = readFileSync(join('.output/server', config.main), 'utf8')
  assert.match(entry, /export\s*\{[^}]*ArticleAudioWorkflow[^}]*\}/)
  assert.match(entry, /export\s*\{[^}]*default[^}]*\}/)
}
else {
  for (const path of files('.output/server').filter(path => /\.(?:js|mjs)$/.test(path)))
    assert.ok(!readFileSync(path, 'utf8').includes('cloudflare:workers'), 'Node 构建不能导入 Cloudflare 运行时')
}
for (const path of files('.output/public').filter(path => /\.(?:js|json|html)$/.test(path))) {
  const content = readFileSync(path, 'utf8')
  assert.ok(!content.includes('openspeech.bytedance.com'), '公开产物不能包含供应商调用逻辑')
  assert.ok(!content.includes('mukuchi-audio-manifest-v1'), '全文生成清单不能进入客户端')
}
console.log('音频产物验收通过：Workflow 导出、运行时隔离、默认开关及全文清单隔离。')
