// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick } from 'vue'
import AudioPlayer from '../app/components/posts/AudioPlayer.client.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.restoreAllMocks()
})
test('播放器无自动播放，单个媒体互斥播放，进度键盘可调，离开页面停止', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function () {
    this.dispatchEvent(new Event('play'))
    this.dispatchEvent(new Event('playing'))
  })
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  const app = createApp({ render: () => h(AudioPlayer, { items: [{ id: 'one', kind: 'narration', url: '/one.mp3' }, { id: 'two', kind: 'podcast', url: '/two.mp3' }] }) })
  app.mount(host)
  let mounted = true
  cleanups.push(() => {
    if (mounted)
      app.unmount()
    host.remove()
  })
  await nextTick()
  const audio = host.querySelector('audio')!
  expect(audio.autoplay).toBe(false)
  expect(play).not.toHaveBeenCalled()
  host.querySelector<HTMLButtonElement>('button[aria-label="播放音频"]')!.click()
  await nextTick()
  expect(play).toHaveBeenCalled()
  expect(host.querySelector('button[aria-label="暂停音频"]')).not.toBeNull()
  Object.defineProperty(audio, 'duration', { value: 120, configurable: true })
  audio.dispatchEvent(new Event('durationchange'))
  await nextTick()
  const slider = host.querySelector<HTMLElement>('[role="slider"]')!
  slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
  await nextTick()
  expect(audio.currentTime).toBe(1)
  const before = pause.mock.calls.length
  Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes('双人播客'))!.click()
  await nextTick()
  expect(pause.mock.calls.length).toBeGreaterThan(before)
  expect(host.querySelectorAll('audio')).toHaveLength(1)
  expect(audio.currentTime).toBe(0)
  const calls = pause.mock.calls.length
  app.unmount()
  mounted = false
  expect(pause.mock.calls.length).toBeGreaterThan(calls)
})
