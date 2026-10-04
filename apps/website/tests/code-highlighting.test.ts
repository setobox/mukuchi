import type { CreateShikiHighlighterOptions } from '@nuxtjs/mdc/runtime/highlighter/shiki'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createShikiHighlighter, parseMarkdown } from '@nuxtjs/mdc/runtime'
import MDCRenderer from '@nuxtjs/mdc/runtime/components/MDCRenderer.vue'
import rehypeHighlight from '@nuxtjs/mdc/runtime/highlighter/rehype'
import { expect, onTestFinished, test } from 'vite-plus/test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CodeGroup from '../app/components/content/CodeGroup.vue'
import ProsePre from '../app/components/content/ProsePre.vue'
import { renderArticlePreview } from '../server/features/admin/preview'
import { codeHighlight, codeThemes } from '../shared/content/code'

// Exercise MDC's installed Shiki dependency rather than mocking tokenization.
const requireMdc = createRequire(createRequire(import.meta.url).resolve('@nuxtjs/mdc'))
type Language = NonNullable<CreateShikiHighlighterOptions['bundledLangs']>[string]
type Theme = NonNullable<CreateShikiHighlighterOptions['bundledThemes']>[string]
async function bundled<T>(path: string): Promise<T> {
  return (await import(/* @vite-ignore */ pathToFileURL(requireMdc.resolve(path)).href) as { default: T }).default
}
async function highlighter(theme: { default: string, light: string } = codeHighlight.theme) {
  return createShikiHighlighter({
    getMdcConfigs: async () => [{ shiki: { setup: instance => onTestFinished(() => instance.dispose()) } }],
    bundledLangs: Object.fromEntries(await Promise.all(codeHighlight.langs.map(async lang => [lang, await bundled<Language>(`@shikijs/langs/${lang}`)]))),
    bundledThemes: Object.fromEntries(await Promise.all(Object.values(theme).map(async name => [name, await bundled<Theme>(`@shikijs/themes/${name}`)]))),
  })
}

test.each([
  ['python', 'from typing import Annotated\nprint("hello")'],
  ['powershell', '$name = "hello"\nWrite-Host $name'],
  ['java', 'public class Demo { String name = "hello"; }'],
  ['xml', '<item name="hello">world</item>'],
  ['sql', 'SELECT name FROM users WHERE id = 1;'],
  ['rust', 'fn main() { println!("hello"); }'],
  ['toml', '[package]\nname = "hello"'],
  ['dockerfile', 'FROM node:24\nRUN echo "hello"'],
  ['js', 'const name = "hello"'],
  ['ts', 'const name: string = "hello"'],
  ['zsh', 'export NAME="hello"'],
  ['sh', 'export NAME="hello"'],
  ['bash', 'export NAME="hello"'],
  ['md', '# Heading\n**hello**'],
  ['tsx', 'const node = <button disabled>hello</button>'],
  ['vue', '<template><button disabled>hello</button></template>'],
])('%s 在首次使用时生成真实的明暗语法颜色', async (language, code) => {
  const highlight = await highlighter()
  const result = await highlight(code, language, codeHighlight.theme, {})
  const tree = JSON.stringify(result.tree)
  expect(tree).toContain('--shiki-default:')
  expect(tree).toContain('--shiki-light:')
  expect(new Set([...tree.matchAll(/--shiki-default:([^;"\\]+)/g)].map(match => match[1])).size).toBeGreaterThan(1)
})

test.each(Object.entries(codeThemes))('%s 的两种模式都有语法颜色，默认文字颜色与主题一致', async (_, preset) => {
  const highlight = await highlighter(preset.theme)
  const result = await highlight('const answer = "hello"', 'ts', preset.theme, {})
  const tree = JSON.stringify(result.tree)
  expect(tree).toContain('--shiki-default:')
  expect(tree).toContain('--shiki-light:')
  for (const [name, foreground] of [[preset.theme.default, preset.foreground.dark], [preset.theme.light, preset.foreground.light]] as const) {
    const theme = await bundled<{ colors: Record<string, string> }>(`@shikijs/themes/${name}`)
    expect(foreground.toLowerCase()).toBe(theme.colors['editor.foreground']!.toLowerCase())
  }
})

const sample = '```ts [example.ts]{4} line-numbers\nconst oldValue = 1 // [!code --]\nconst newValue = 2 // [!code ++]\nconsole.log(newValue) // [!code focus]\nconst enabled = true // [!code highlight]\nthrow new Error("example") // [!code error]\nconsole.warn("example") // [!code warning]\n```'

test('真实 Markdown 保留行号、重点行、增删、聚焦和错误标记，代码组也能渲染', async () => {
  const highlight = { ...codeHighlight, highlighter: await highlighter() }
  const { body, data } = await parseMarkdown(`::code-group\n\n${sample}\n\n\`\`\`text\nplain\n\`\`\`\n\n::`, {
    highlight,
    rehype: { plugins: { highlight: { instance: rehypeHighlight, options: highlight } } },
  })
  const app = createSSRApp({ render: () => h(MDCRenderer, { body, data, components: { 'pre': ProsePre, 'code-group': CodeGroup } }) })
  const html = await renderToString(app)
  expect(html).toContain('code-line-numbers')
  expect(html).toContain('line diff remove')
  expect(html).toContain('line diff add')
  expect(html).toContain('line focused')
  expect(html).toContain('line highlight highlighted')
  expect(html).toContain('highlighted error')
  expect(html).toContain('highlighted warning')
  expect(html).toContain('has-focused')
  expect(html).toContain('has-diff')
  expect(html).toContain('line="4"')
  expect(html).toContain('role="tablist"')
  expect(html).toContain('--code-dark-fg:')
  expect(html).toContain('plain')
  expect(html).not.toContain('[!code')
})

test('纯文本也能显示行号，保留空行并转义 HTML', async () => {
  const source = '```text [output.txt] line-numbers\n<script>alert(1)</script>\n\nlast\n```'
  const { body, data } = await parseMarkdown(source, { highlight: false })
  const app = createSSRApp({ render: () => h(MDCRenderer, { body, data, components: { pre: ProsePre } }) })
  const html = await renderToString(app)
  expect(html).toContain('line="3"')
  expect(html).toContain('line="2">\n</span>')
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html).not.toContain('<script>')
})

test('后台预览与文章解析对同一代码生成相同的高亮内容', async () => {
  const highlight = { ...codeHighlight, highlighter: await highlighter() }
  const { body } = await parseMarkdown(sample, {
    contentHeading: false,
    highlight,
    rehype: { plugins: { highlight: { instance: rehypeHighlight, options: highlight } } },
  })
  const source = `---\ntitle: 高亮测试\ndescription: 测试\npublish: '2026-10-04'\n---\n\n${sample}`
  const preview = await renderArticlePreview(source, 'highlight.md', [], '', { status: 'missing', record: null, message: '' }, undefined, highlight.highlighter)
  expect(preview.body).toEqual(body)
})
