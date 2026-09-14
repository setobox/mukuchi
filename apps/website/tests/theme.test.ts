import type { ArticleAccent } from '../app/features/theme/article.ts'
import type { ThemeControllerOptions } from '../app/features/theme/controller.ts'
import type { ResolvedTheme, ThemePreference } from '../shared/theme/preference.ts'
import { runInNewContext } from 'node:vm'
import { expect, test, vi } from 'vite-plus/test'
import { ref } from 'vue'
import { createArticleAccentScope, resolveArticleAccent } from '../app/features/theme/article.ts'
import { circleMask, createThemeController, eventOrigin } from '../app/features/theme/controller.ts'
import { themeColors } from '../shared/content/schema.ts'
import { accentBackgrounds, contrastRatio, mixColor, readableAccent } from '../shared/theme/palette.ts'
import { nextPreference, normalizePreference, resolveTheme, themeCookieBootstrap } from '../shared/theme/preference.ts'

function setup(overrides: Partial<ThemeControllerOptions> = {}) {
  const preference = ref<ThemePreference>('system')
  const resolved = ref<ResolvedTheme>('dark')
  const apply = vi.fn(async (value: ThemePreference) => {
    preference.value = value
    resolved.value = resolveTheme(value, 'dark')
  })
  const options: ThemeControllerOptions = {
    preference: () => preference.value,
    resolved: () => resolved.value,
    unknown: () => false,
    system: () => 'dark',
    apply,
    canAnimate: () => false,
    ...overrides,
  }
  return { controller: createThemeController(options), apply, preference, resolved }
}

test('模式按系统、浅色、深色循环，未知值回到系统', () => {
  expect(nextPreference('system')).toBe('light')
  expect(nextPreference('light')).toBe('dark')
  expect(nextPreference('dark')).toBe('system')
  for (const value of ['', null, [], {}, 'LIGHT', 'invalid mode'])
    expect(normalizePreference(value)).toBe('system')
})

test('系统模式响应系统变化，手动模式保持选择，未知系统回退深色', () => {
  expect(resolveTheme('system', 'light')).toBe('light')
  expect(resolveTheme('system', 'dark')).toBe('dark')
  expect(resolveTheme('system', null)).toBe('dark')
  expect(resolveTheme('dark', 'light')).toBe('dark')
  expect(resolveTheme('light', 'dark')).toBe('light')
})

test('实际首屏脚本只修复异常 Cookie，存储不可读或不可写时不会中断页面', () => {
  const doc = { cookie: 'other=1; mukuchi:theme=invalid mode' }
  runInNewContext(themeCookieBootstrap, { document: doc })
  expect(doc.cookie).toContain('mukuchi:theme=system; Max-Age=31536000; Path=/; SameSite=Lax')
  const valid = { cookie: 'mukuchi:theme=light' }
  runInNewContext(themeCookieBootstrap, { document: valid })
  expect(valid.cookie).toBe('mukuchi:theme=light')
  for (const unreadable of [true, false]) {
    const blocked = Object.defineProperty({}, 'cookie', {
      get() {
        if (unreadable)
          throw new Error('blocked')
        return 'mukuchi:theme=bad'
      },
      set() {
        throw new Error('blocked')
      },
    })
    expect(() => runInNewContext(themeCookieBootstrap, { document: blocked })).not.toThrow()
  }
})

test('明暗未变化时只保存偏好，首屏尚未确定时不能切换', async () => {
  const start = vi.fn()
  const { controller, preference, apply } = setup({ canAnimate: () => true, start })
  await controller.setPreference('dark')
  expect(preference.value).toBe('dark')
  expect(apply).toHaveBeenCalledTimes(1)
  expect(start).not.toHaveBeenCalled()
  const pending = setup({ unknown: () => true })
  await pending.controller.cyclePreference()
  expect(pending.apply).not.toHaveBeenCalled()
})

test('减少动态效果或无动画 API 时仍能完成切换', async () => {
  for (const options of [{ canAnimate: () => false, start: vi.fn() }, { canAnimate: () => true }]) {
    const { controller, preference } = setup(options)
    await controller.cyclePreference()
    expect(preference.value).toBe('light')
    expect(controller.isTransitioning.value).toBe(false)
    if (options.start)
      expect(options.start).not.toHaveBeenCalled()
  }
})

test('动画期间忽略重复触发，完成后清理并允许下一次操作', async () => {
  let finishAnimation!: () => void
  const done = new Promise<void>((resolve) => {
    finishAnimation = resolve
  })
  const cancel = vi.fn()
  const finish = vi.fn()
  const { controller, apply } = setup({
    canAnimate: () => true,
    start: update => ({ ready: update(), finished: done, skipTransition: finishAnimation }),
    animate: () => ({ finished: done, cancel }),
    finish,
  })
  const first = controller.cyclePreference({ x: 10, y: 20 })
  await controller.cyclePreference()
  expect(controller.isTransitioning.value).toBe(true)
  expect(apply).toHaveBeenCalledTimes(1)
  finishAnimation()
  await first
  expect(controller.isTransitioning.value).toBe(false)
  expect(cancel).toHaveBeenCalledOnce()
  expect(finish).toHaveBeenCalledOnce()
})

test('动画开始、快照或遮罩失败时只提交一次并解除锁定', async () => {
  for (const stage of ['start', 'ready', 'animate']) {
    const { controller, apply } = setup({
      canAnimate: () => true,
      start: (update) => {
        if (stage === 'start')
          throw new Error('not supported')
        return { ready: update().then(() => {
          if (stage === 'ready')
            throw new Error('skip')
        }), finished: Promise.resolve(), skipTransition() {} }
      },
      animate: () => { throw new Error('animation failed') },
    })
    await expect(controller.cyclePreference()).resolves.toBeUndefined()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(controller.preference.value).toBe('light')
    expect(controller.isTransitioning.value).toBe(false)
  }
})

test('页面退出取消未完成快照时仍提交选择且不启动遮罩', async () => {
  let rejectReady!: (error: Error) => void
  const ready = new Promise<void>((_, reject) => {
    rejectReady = reject
  })
  const animate = vi.fn()
  const { controller, apply } = setup({
    canAnimate: () => true,
    start: () => ({ ready, finished: Promise.resolve(), skipTransition: () => rejectReady(new Error('cancelled')) }),
    animate,
  })
  const operation = controller.cyclePreference()
  controller.cancel()
  await operation
  expect(apply).toHaveBeenCalledOnce()
  expect(animate).not.toHaveBeenCalled()
  expect(controller.isTransitioning.value).toBe(false)
})

test('圆形遮罩覆盖最远角，键盘从按钮中心开始，指针保留零坐标', () => {
  expect(circleMask({ x: 0, y: 0 }, 300, 400)).toEqual(['circle(0px at 0px 0px)', 'circle(500px at 0px 0px)'])
  class Element {
    getBoundingClientRect() { return { left: 100, top: 20, width: 44, height: 44 } }
  }
  vi.stubGlobal('HTMLElement', Element)
  try {
    expect(eventOrigin({ detail: 0, currentTarget: new Element() } as unknown as MouseEvent)).toEqual({ x: 122, y: 42 })
    expect(eventOrigin({ detail: 1, clientX: 0, clientY: 10 } as MouseEvent)).toEqual({ x: 0, y: 10 })
  }
  finally { vi.unstubAllGlobals() }
})

test('文章配色支持替换与退出，旧实例释放不影响新文章，404 和列表恢复默认', () => {
  const state = ref<ArticleAccent | null>(null)
  const old = createArticleAccentScope(state, 'old', '/posts/a')
  const next = createArticleAccentScope(state, 'next', '/posts/b')
  old.update('#ff4b4b')
  expect(resolveArticleAccent(state.value, '/posts/a')).toBe('#ff4b4b')
  next.update('#00ffaa')
  old.release()
  expect(resolveArticleAccent(state.value, '/posts/b')).toBe('#00ffaa')
  expect(resolveArticleAccent(state.value, '/posts')).toBe('#a369ff')
  expect(resolveArticleAccent(state.value, '/posts/b', true)).toBe('#a369ff')
  next.release()
  expect(state.value).toBeNull()
  expect(resolveArticleAccent(state.value, '/posts/b')).toBe('#a369ff')
})

test('全部 16 色的强调文字及按钮在深浅背景上满足对比度', () => {
  for (const color of themeColors) {
    expect(contrastRatio(color, '#171615')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(mixColor(color, '#ffffff', 0.1), '#171615')).toBeGreaterThanOrEqual(4.5)
    for (const mode of ['dark', 'light'] as const) {
      const foreground = readableAccent(color, mode)
      for (const background of accentBackgrounds(color, mode))
        expect(contrastRatio(foreground, background), `${mode} ${color} ${background}`).toBeGreaterThanOrEqual(4.5)
    }
  }
})
