// @vitest-environment happy-dom
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import MDCRenderer from '@nuxtjs/mdc/runtime/components/MDCRenderer.vue'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { createApp, createSSRApp, h, nextTick, Suspense } from 'vue'
import { renderToString } from 'vue/server-renderer'
import Alert from '../app/components/content/Alert.vue'
import { resolveAlert } from '../app/features/alerts/model'
import { revealContent } from '../app/features/collapse/reveal'
import { renderArticlePreview } from '../server/features/admin/preview'
import { alertTheme, mdcBoolean } from '../shared/content/alerts'

const cleanups: (() => void)[] = []
beforeEach(() => {
  vi.stubGlobal('useAppConfig', () => ({ site: { article: { alerts: { theme: 'github' } } } }))
})
afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function flush() {
  for (let index = 0; index < 5; index++) await nextTick()
}

async function markdown(source: string) {
  const parsed = await parseMarkdown(source, { highlight: false, toc: { depth: 5, searchDepth: 12 } })
  const component = { render: () => h(Suspense, {}, { default: () => h(MDCRenderer, {
    ...parsed,
    components: { alert: Alert, a: 'a', pre: 'pre', code: 'code' },
  }) }) }
  return { ...parsed, component, html: await renderToString(createSSRApp(component)) }
}

const typeSets = {
  github: ['note', 'tip', 'important', 'warning', 'caution'],
  vitepress: ['note', 'tip', 'important', 'warning', 'caution'],
  docusaurus: ['note', 'tip', 'info', 'warning', 'danger'],
  obsidian: ['note', 'abstract', 'summary', 'tldr', 'info', 'todo', 'tip', 'hint', 'important', 'success', 'check', 'done', 'question', 'help', 'faq', 'warning', 'attention', 'caution', 'failure', 'missing', 'fail', 'danger', 'error', 'bug', 'example', 'quote', 'cite'],
} as const

test.each(Object.entries(typeSets))('%s 的全部类型通过真实 MDC 渲染，保留各自默认标题和图标', async (theme, types) => {
  const { html, toc } = await markdown(types.map(type => `::alert{theme="${theme}" type="${type}"}\n\n正文-${type}。\n\n::`).join('\n\n'))
  const host = document.createElement('div')
  host.innerHTML = html
  const alerts = [...host.querySelectorAll('.mdc-alert')]
  expect(alerts).toHaveLength(types.length)
  alerts.forEach((alert, index) => {
    const type = types[index]!
    expect(alert.getAttribute('data-alert-type')).toBe(type)
    expect(alert.getAttribute('data-alert-theme')).toBe(theme)
    expect(alert.querySelector('.mdc-alert-label')?.textContent).toBe(
      ['vitepress', 'docusaurus'].includes(theme) ? type.toUpperCase() : type[0]!.toUpperCase() + type.slice(1),
    )
    expect(alert.querySelector('svg')).not.toBeNull()
    expect(alert.textContent).toContain(`正文-${type}。`)
    expect(alert.querySelector('button')).toBeNull()
  })
  expect(toc.links).toEqual([])
  expect(host.querySelector('[role="alert"]')).toBeNull()
})

test('主题覆盖、大小写、非法输入和原型属性名均安全回退', () => {
  expect(resolveAlert(' TIP ', ' OBSIDIAN ', 'github', '').theme).toBe('obsidian')
  expect(resolveAlert('check', undefined, 'obsidian', undefined)).toMatchObject({ type: 'check', title: 'Check' })
  expect(resolveAlert('info', 'invalid', 'docusaurus', '自定义')).toMatchObject({ theme: 'docusaurus', type: 'info', title: '自定义' })
  expect(resolveAlert('danger', undefined, 'github', undefined)).toMatchObject({ type: 'note', title: 'Note' })
  for (const value of ['constructor', '__proto__', 'toString', null, {}, 1]) {
    expect(resolveAlert(value, value, value, '  ')).toMatchObject({ theme: 'github', type: 'note', title: 'Note' })
  }
  expect(alertTheme('VitePress')).toBe('vitepress')
  for (const value of [false, 'false', '0', 0, undefined, {}, 'TRUE']) expect(mdcBoolean(value)).toBe(false)
  for (const value of [true, 'true', '']) expect(mdcBoolean(value)).toBe(true)
})

test('组件读取站点默认，显式主题优先，标题作为纯文本输出', async () => {
  vi.stubGlobal('useAppConfig', () => ({ site: { article: { alerts: { theme: 'docusaurus' } } } }))
  const { html } = await markdown('::alert{type="info"}\n默认配置。\n::\n\n::alert{theme="github" title="<img src=x onerror=alert(1)>"}\n独立主题。\n::')
  expect(html).toContain('data-alert-theme="docusaurus" data-alert-type="info"')
  expect(html).toContain('data-alert-theme="github"')
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  expect(html).not.toContain('<img')
})

test('正文保留 Markdown、代码和嵌套，闭合后的段落不进入提醒框', async () => {
  const { html } = await markdown(':::alert{theme="github" type="warning"}\n\n**粗体**与[链接](/about)和 `inline`。\n\n- 第一项\n- 第二项\n\n```ts\nconst value = 1\n```\n\n::alert{theme="obsidian" type="check"}\n\n内层正文。\n\n::\n\n:::\n\n框外正文。')
  const host = document.createElement('div')
  host.innerHTML = html
  const outer = host.querySelector('.mdc-alert')!
  expect(outer.querySelector('strong')?.textContent).toBe('粗体')
  expect(outer.querySelector('a')?.getAttribute('href')).toBe('/about')
  expect(outer.querySelectorAll('li')).toHaveLength(2)
  expect(outer.querySelector('pre')?.textContent).toContain('const value = 1')
  expect(outer.querySelector('.mdc-alert')?.getAttribute('data-alert-type')).toBe('check')
  expect(outer.textContent).not.toContain('框外正文')
  expect(host.textContent).toContain('框外正文')
})

test.each([
  ['', null],
  ['collapsible="false" :open="true"', null],
  ['collapsible', 'false'],
  [':collapsible="true" :open="true"', 'true'],
  ['collapsible="true" open="false"', 'false'],
  ['collapsible open="true"', 'true'],
])('MDC 布尔属性 %s 在 SSR 中保持正确初始状态', async (attributes, expanded) => {
  const { html } = await markdown(`::alert{${attributes}}\n\n正文。\n\n::`)
  const host = document.createElement('div')
  host.innerHTML = html
  expect(host.querySelector('button')?.getAttribute('aria-expanded') ?? null).toBe(expanded)
  expect(host.querySelector('[inert]') !== null).toBe(expanded === 'false')
  expect(host.textContent).toContain('正文。')
})

test('水合保持初始状态，折叠实例独立，锚点展开所有父级提醒框', async () => {
  const { component, html } = await markdown(':::alert{collapsible title="外层"}\n\n::alert{theme="obsidian" collapsible title="内层"}\n\n### 隐藏标题\n\n::\n\n:::\n\n::alert{collapsible title="独立"}\n\n其他内容。\n\n::')
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  const ids = [...host.querySelectorAll('button')].map(button => button.getAttribute('aria-controls'))
  const warn = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  const app = createSSRApp(component)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  await flush()
  const buttons = [...host.querySelectorAll('button')]
  expect(buttons.map(button => button.getAttribute('aria-controls'))).toEqual(ids)
  expect(buttons.map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false'])
  buttons[2]!.click()
  await flush()
  expect(buttons.map(button => button.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'true'])
  await expect(revealContent(host.querySelector('h3')!)).resolves.toBe(true)
  expect(buttons.map(button => button.getAttribute('aria-expanded'))).toEqual(['true', 'true', 'true'])
  expect(host.querySelector('h3')!.closest('[inert]')).toBeNull()
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

test('关闭提醒框时焦点回到触发按钮，正文不被卸载', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Alert, { collapsible: true, open: true }, { default: () => h('input') }) })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  const input = host.querySelector('input')!
  input.value = '保留输入'
  input.focus()
  host.querySelector('button')!.click()
  await flush()
  expect(document.activeElement).toBe(host.querySelector('button'))
  expect(host.querySelector('input')).toBe(input)
  expect(input.value).toBe('保留输入')
})

test('后台预览解析的提醒框与普通 Markdown 使用相同组件及属性', async () => {
  const body = '::alert{theme="docusaurus" type="danger" collapsible :open="true" title="预览提醒"}\n\n**预览正文**。\n\n::'
  const preview = await renderArticlePreview(`---\ntitle: 测试\ndescription: 提醒框预览\npublish: '2026-09-27'\n---\n\n${body}`, 'alerts.md', [], '', { status: 'missing', record: null, message: '' })
  const html = await renderToString(createSSRApp({ render: () => h(MDCRenderer, {
    body: preview.body,
    data: preview.data,
    components: { alert: Alert },
  }) }))
  expect(html).toContain('data-alert-theme="docusaurus" data-alert-type="danger"')
  expect(html).toContain('aria-expanded="true"')
  expect(html).toContain('预览提醒')
  expect(html).toContain('<strong>预览正文</strong>')
})
