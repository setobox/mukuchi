import { expect, test } from 'vite-plus/test'
import { validateStatsRelease } from '../shared/stats/release'

test('统计发布须使用独立真实绑定及服务端密钥，关闭时无需统计资源', () => {
  const valid = { enabled: true, statsId: '42d45b5c-d39e-40dc-90d8-2ad117729f9e', contentId: 'c8f87923-1ca6-4f8c-94b6-644f621d19db', secretNames: ['NUXT_STATS_HASH_SECRET'] }
  expect(() => validateStatsRelease(valid)).not.toThrow()
  for (const statsId of [undefined, 'local', '00000000-0000-0000-0000-000000000000', valid.contentId])
    expect(() => validateStatsRelease({ ...valid, statsId })).toThrow()
  expect(() => validateStatsRelease({ ...valid, secretNames: [] })).toThrow()
  expect(() => validateStatsRelease({ enabled: false, statsId: undefined, contentId: undefined, secretNames: [] })).not.toThrow()
})
