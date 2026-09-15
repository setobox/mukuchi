import { readFileSync } from 'node:fs'
import { Window } from 'happy-dom'
import { expect, test } from 'vite-plus/test'

const baseCss = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')

test.each([375, 900, 1199, 1200])('宽度 %i 的首屏目录偏移支持 SSR、实际测量和离开文章', async (width) => {
  const window = new Window({ width, height: 900 })
  const document = window.document
  const style = document.createElement('style')
  style.textContent = baseCss
  document.head.append(style)
  const html = document.documentElement
  html.classList.add('has-article-toc')
  html.style.setProperty('--toc-preview-height', '5.25rem')
  const offset = () => window.getComputedStyle(html).getPropertyValue('--toc-offset')
  // No client measurement is present on the server-rendered document.
  expect(html.style.getPropertyValue('--toc-height')).toBe('')
  expect(offset()).not.toBe('')
  if (width < 1200) {
    expect(offset()).not.toBe('0px')
    expect(offset()).toContain('5.25rem')
    expect(offset()).toContain('2rem')
    expect(offset()).toContain('0.25rem')
  }
  else {
    expect(offset()).toBe('0px')
  }
  html.style.setProperty('--toc-height', '420px')
  if (width < 1200)
    expect(window.getComputedStyle(html).scrollPaddingTop).toContain('420px')
  else
    expect(offset()).toBe('0px')
  html.classList.remove('has-article-toc')
  expect(offset()).toBe('')
  await window.happyDOM.abort()
})

test.each(['reduce', 'no-preference'])('目录展开动画遵循减少动态效果设置：%s', async (prefersReducedMotion) => {
  const window = new Window({ settings: { device: { prefersReducedMotion } } })
  const document = window.document
  const source = readFileSync(new URL('../app/components/toc/ContentToc.vue', import.meta.url), 'utf8')
  const animationCss = source.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1]
  const style = document.createElement('style')
  style.textContent = `${baseCss}\n${animationCss}`
  document.head.append(style)
  const content = document.createElement('div')
  content.className = 'toc-content'
  content.setAttribute('data-state', 'open')
  document.body.append(content)
  const computed = window.getComputedStyle(content)
  if (prefersReducedMotion === 'reduce')
    expect(computed.animationDuration).toBe('0.01ms')
  else
    expect(computed.animation).toBe('toc-expand 200ms ease-out')
  const preview = document.createElement('div')
  preview.className = 'toc-preview'
  document.body.append(preview)
  if (prefersReducedMotion === 'reduce')
    expect(window.getComputedStyle(preview).transitionDuration).toBe('0.01ms')
  else
    expect(window.getComputedStyle(preview).transition).toBe('height 200ms ease-out')
  await window.happyDOM.abort()
})
