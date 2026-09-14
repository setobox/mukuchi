// @vitest-environment happy-dom
import { expect, test, vi } from 'vite-plus/test'
import { createApp, h, nextTick } from 'vue'
import Github from '../app/components/content/Github.vue'

test('头像在水合前失败或加载后触发错误时，都回退为本地图标', async () => {
  for (const cachedFailure of [true, false]) {
    const request = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('组件测试禁止网络请求'))
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(cachedFailure)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0)
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(Github, { repo: 'nuxt/content' }) })
    try {
      app.mount(host)
      await nextTick()
      if (!cachedFailure) {
        const image = host.querySelector('img')
        expect(image).not.toBeNull()
        image!.dispatchEvent(new Event('error'))
        await nextTick()
      }
      expect(host.querySelector('img')).toBeNull()
      expect(host.querySelector('.i-lucide-user-round')).not.toBeNull()
      expect(host.querySelector('a')?.getAttribute('href')).toBe('https://github.com/nuxt/content')
      expect(request).not.toHaveBeenCalled()
    }
    finally {
      app.unmount()
      host.remove()
      vi.restoreAllMocks()
    }
  }
})
