import type { BatchItem } from '../app/features/admin/batch'
import type { AudioSettingsView } from '../shared/audio/model'
import { expect, test } from 'vite-plus/test'
import { runSummaryBatch } from '../app/features/admin/batch'
import { defaultAudioSettings } from '../shared/audio/model'
import { acceptAudioSettings, audioSettingsForKind } from '../shared/audio/settings-form'

const items = (): BatchItem[] => Array.from({ length: 6 }, (_, i) => ({ path: `${i}.md`, title: `文章 ${i}`, status: 'pending', message: '' }))

test('摘要批量最多两篇并发，失败不阻断其余文章，重试只处理失败项', async () => {
  const rows = items()
  let active = 0
  let maximum = 0
  const calls: string[] = []
  await runSummaryBatch(rows, async (item) => {
    calls.push(item.path)
    active++
    maximum = Math.max(maximum, active)
    await Promise.resolve()
    active--
    if (item.path === '1.md')
      throw new Error('编辑稿版本冲突')
  }, () => false, error => (error as Error).message)
  expect(maximum).toBe(2)
  expect(rows.filter(item => item.status === 'succeeded')).toHaveLength(5)
  const failures = rows.filter(item => item.status === 'failed')
  expect(failures[0]?.message).toBe('编辑稿版本冲突')
  await runSummaryBatch(failures, async (item) => {
    calls.push(item.path)
  }, () => false, String)
  expect(calls.filter(path => path === '1.md')).toHaveLength(2)
  expect(calls.filter(path => path === '0.md')).toHaveLength(1)
  expect(rows.every(item => item.status === 'succeeded')).toBe(true)
})

test('停止派发保留在途结果并标记尚未开始的任务', async () => {
  const rows = items()
  let stop = false
  const finish: (() => void)[] = []
  const work = runSummaryBatch(rows, () => new Promise<void>((resolve) => {
    finish.push(resolve)
  }), () => stop, String)
  expect(rows.filter(item => item.status === 'running')).toHaveLength(2)
  stop = true
  finish.forEach(resolve => resolve())
  await work
  expect(rows.filter(item => item.status === 'succeeded')).toHaveLength(2)
  expect(rows.filter(item => item.status === 'cancelled')).toHaveLength(4)
})

test('保存一个音频 tab 不提交或丢失另一个 tab 的未保存输入，共用字段与版本保持一致', () => {
  const saved: AudioSettingsView = { ...defaultAudioSettings, version: 3, keyConfigured: true, encryptionReady: true, executionReady: true }
  const form = { ...saved, appId: 'shared-app', narrationSpeaker: 'saved-speaker', podcastSpeaker1: 'unsaved-host' }
  const payload = audioSettingsForKind(saved, form, 'narration')
  expect(payload.appId).toBe('shared-app')
  expect(payload.narrationSpeaker).toBe('saved-speaker')
  expect(payload.podcastSpeaker1).toBe(saved.podcastSpeaker1)
  const response = { ...saved, ...payload, version: 4 }
  const next = acceptAudioSettings(form, response, 'narration')
  expect(next.podcastSpeaker1).toBe('unsaved-host')
  expect(next.version).toBe(4)
  expect(audioSettingsForKind(response, next, 'podcast').podcastSpeaker1).toBe('unsaved-host')
  expect(audioSettingsForKind(response, next, 'podcast').narrationSpeaker).toBe('saved-speaker')
})
