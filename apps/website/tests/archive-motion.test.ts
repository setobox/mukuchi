import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { expect, test } from 'vite-plus/test'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ArchiveTimeline from '../app/components/archive/ArchiveTimeline.vue'

const themeCss = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')
const source = readFileSync(new URL('../app/components/archive/ArchiveTimeline.vue', import.meta.url), 'utf8')
const motionCss = source.match(/<style scoped>([\s\S]*?)<\/style>/)![1]!
const NuxtLink = defineComponent({ props: ['to'], setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()) })

test.each([
  ['light', 'reduce'],
  ['light', 'no-preference'],
  ['dark', 'reduce'],
  ['dark', 'no-preference'],
] as const)('时间线在 %s / %s 下整行联动悬停与键盘焦点，减少动态效果时不位移', async (theme, prefersReducedMotion) => {
  const window = new Window({ settings: { device: { prefersReducedMotion } } })
  const { document } = window
  document.documentElement.className = theme
  const style = document.createElement('style')
  // Happy DOM lacks pointer/focus-visible matching; exercise the same selector
  // structure and computed styles using explicit state attributes.
  style.textContent = themeCss + motionCss.replaceAll(':hover', '[data-hover]').replaceAll(':focus-visible', '[data-focus]')
  document.head.append(style)
  const app = createSSRApp(ArchiveTimeline, { posts: [{ title: '测试文章', publish: '2026-09-26', path: '/posts/test' }] })
  app.component('NuxtLink', NuxtLink)
  document.body.innerHTML = await renderToString(app)
  try {
    const entry = document.querySelector<HTMLElement>('.archive-entry')!
    const title = document.querySelector<HTMLElement>('.archive-title')!
    const dot = document.querySelector<HTMLElement>('.archive-dot')!
    const arrow = document.querySelector<HTMLElement>('.archive-arrow')!
    expect(window.getComputedStyle(arrow).opacity).toBe('0')
    const idle = window.getComputedStyle(dot).backgroundColor
    for (const state of ['data-hover', 'data-focus']) {
      entry.setAttribute(state, '')
      expect(window.getComputedStyle(arrow).opacity).toBe('1')
      expect(window.getComputedStyle(dot).backgroundColor).not.toBe(idle)
      expect(window.getComputedStyle(title).color).toBe(window.getComputedStyle(entry).color)
      if (prefersReducedMotion === 'reduce') {
        for (const element of [dot, title, arrow]) {
          expect(window.getComputedStyle(element).transition).toBe('none')
          expect(window.getComputedStyle(element).transform).toBe('none')
        }
      }
      else {
        expect(window.getComputedStyle(title).transform).toBe('translateX(3px)')
        expect(window.getComputedStyle(dot).transform).toBe('scale(1.3)')
        expect(window.getComputedStyle(title).transition).toContain('180ms')
      }
      entry.removeAttribute(state)
    }
  }
  finally {
    await window.happyDOM.abort()
  }
})
