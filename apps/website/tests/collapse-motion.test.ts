import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { expect, test } from 'vite-plus/test'

const baseCss = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')
const source = readFileSync(new URL('../app/components/base/BaseCollapsible.vue', import.meta.url), 'utf8')
const componentCss = source.match(/<style scoped>([\s\S]*?)<\/style>/)![1]

test.each(['reduce', 'no-preference'] as const)('折叠样式支持自动高度和减少动态效果：%s', async (prefersReducedMotion) => {
  const window = new Window({ settings: { device: { prefersReducedMotion } } })
  const { document } = window
  const style = document.createElement('style')
  style.textContent = `${baseCss}\n${componentCss}`
  document.head.append(style)
  const viewport = document.createElement('div')
  viewport.className = 'collapsible-viewport'
  viewport.dataset.open = 'false'
  document.body.append(viewport)
  try {
    const css = () => window.getComputedStyle(viewport)
    expect(css().display).toBe('grid')
    expect(css().gridTemplateRows).toBe('0fr')
    expect(css().visibility).toBe('hidden')
    viewport.dataset.open = 'true'
    expect(css().gridTemplateRows).toBe('1fr')
    expect(css().visibility).toBe('visible')
    if (prefersReducedMotion === 'reduce') {
      expect(css().transition).toBe('none')
    }
    else {
      expect(css().transition).toContain('grid-template-rows 180ms ease-out')
      viewport.dataset.instant = 'true'
      expect(css().transition).toBe('none')
    }
  }
  finally {
    await window.happyDOM.abort()
  }
})
