import { expect, test } from 'vite-plus/test'
import { audioArticle } from '../server/features/audio/content'
import { audioSource } from './fixtures/audio'

test.each([
  ['[官方文档](https://example.com/docs?a=1)', '官方文档'],
  ['打开 https://example.com/docs?a=1。然后继续。', '打开 这个链接。然后继续。'],
  ['<https://example.com/docs>，以及 www.example.com/help。', '这个链接，以及 这个链接。'],
  ['[example.com](https://example.com)', '这个链接'],
  ['[https://example.com](https://example.com)', '这个链接'],
  ['`Vue`、`TypeScript`、`Node.js`、`ref`、`3.5.0`', 'Vue、TypeScript、Node.js、ref、3.5.0'],
  ['执行 `pnpm run build`，调用 `ref(0)`，赋值 `x = 1`。', '执行 这段代码，调用 这段代码，赋值 这段代码。'],
  ['`https://example.com/a` 和 `src/main.ts`', '这个链接 和 这个文件'],
  ['`https://example.com/src/main.ts` 和 `www.example.com/app.js`', '这个链接 和 这个链接'],
  ['修改src/main.ts，然后打开 apps/website/app.vue。', '修改这个文件，然后打开 这个文件。'],
  ['保存到 `content/posts/`，检查 `src/components`。', '保存到 这个目录，检查 这个路径。'],
  ['路径 /usr/local/bin、./config.json、../public/ 和 ~/.config/。', '路径 这个路径、这个文件、这个目录 和 这个目录。'],
  ['修改 /文档/说明.md后继续，检查 `~/项目/`。', '修改 这个文件后继续，检查 这个目录。'],
  [String.raw`打开 C:\Users\name\file.ts，再看 \\server\share\folder\。`, '打开 这个文件，再看 这个目录。'],
  ['打开 `C:\\Program Files\\项目\\main.ts`。', '打开 这个文件。'],
  ['路径 ./foo.bar/baz 和 ./foo.bar/，文件 .github/workflows/ci.yml。', '路径 这个路径 和 这个目录，文件 这个文件。'],
  ['Vue/Nuxt、HTTP/2、1/2、2026/09/26、3.5.0。', 'Vue/Nuxt、HTTP/2、1/2、2026/09/26、3.5.0。'],
  ['日期 `2026/09/26`，比例 `1/2`。', '日期 2026/09/26，比例 1/2。'],
])('两种音频过滤技术片段并保留语句边界：%s', async (source, expected) => {
  const article = await audioArticle('test.md', `${audioSource}\n${source}`)
  expect(article.narration).toBe(`测试文章\n\n文章正文。\n\n${expected}`)
  expect(article.podcast).toBe(article.narration)
})

test('连续代码块及 MDC 代码组合并提示，不吞掉夹在中间的正文', async () => {
  const source = [
    '```ts [src/main.ts]\nconst secretCode = 42\n```',
    '::code-group\n\n```bash\npnpm install\n```\n\n```json\n{"key":true}\n```\n\n::',
    '这里解释代码的作用。',
    '::prose-pre{code="const hiddenCode = 1"}\n::',
  ].join('\n\n')
  const article = await audioArticle('test.md', `${audioSource}\n${source}`)
  expect(article.narration).toBe('测试文章\n\n文章正文。\n\n这里作者提供了一段代码示例。\n\n这里解释代码的作用。\n\n这里作者提供了一段代码示例。')
  expect(article.podcast).toBe(article.narration)
})

test('语音标题、图片说明和表格同样过滤引用，显示标题不变', async () => {
  const title = '项目 src/main.ts 与 https://example.com。'
  const article = await audioArticle('test.md', `${audioSource.replace('测试文章', title)}
![打开 src/main.ts，查看 https://example.com。](https://example.com/image.png)

| 位置 | 命令 |
| --- | --- |
| src/main.ts | \`pnpm run build\` |
`)
  expect(article.title).toBe(title)
  expect(article.narration).toContain('项目 这个文件 与 这个链接。')
  expect(article.narration).toContain('这里作者配了一张图，打开 这个文件，查看 这个链接。')
  expect(article.narration).toContain('这个文件；这段代码；')
  expect(article.narration).not.toMatch(/src\/main|example\.com|pnpm/)
  expect(article.podcast).toBe(article.narration)
})

test('MDC 媒体和仓库卡片使用口语化介绍，不读取参数及交互后备内容', async () => {
  const source = [
    '::github{repo="nuxt/content"}\n仓库卡片的交互文字\n::',
    '::bilibili{bvid="BV123" title="播放器标题"}\n点击播放\n::',
    '::youtube{id="video-id" src="https://example.com/embed"}\n播放器后备文字\n::',
    ':icon{name="lucide:code"} :app-icon{name="copy"}',
    '<svg><text>图标标签</text></svg><button>复制内容</button>',
    '<span aria-hidden="true">隐藏标签</span><div hidden>隐藏内容</div>',
    '继续讲解。',
  ].join('\n\n')
  const article = await audioArticle('test.md', `${audioSource}\n${source}`)
  expect(article.narration).toContain('这里作者分享了一个项目链接。')
  expect(article.narration).toContain('这里作者附上了一段视频。')
  expect(article.narration).toContain('继续讲解。')
  expect(article.narration).not.toContain('请参阅原文')
  expect(article.narration).not.toMatch(/nuxt|content|BV123|播放器|播放|video-id|example|lucide|copy|图标标签|复制内容|交互文字|隐藏/)
  expect(article.podcast).toBe(article.narration)
})

test('保留滚动、折叠与未知 MDC 容器正文，过滤其中的代码及交互插槽', async () => {
  const source = [
    '::scroll-container{max-height="20rem" label="滚动区域标签"}\n\n> 保留长引用，含 `ref(0)`。\n\n::',
    '<details><summary>原理说明</summary><p>保留折叠正文。</p></details>',
    '::example-panel\n---\ntitle: 组件参数标题\nitems:\n  - 结构化参数\n---\n#header\n标题插槽\n\n#default\n保留正文插槽和 :span[行内术语]。\n\n#actions\n点击操作\n\n#footer\n保留补充说明。\n::',
    '::code-group\n\n分组里的解释。\n\n```ts\nconst grouped = 1\n```\n\n::',
  ].join('\n\n')
  const article = await audioArticle('test.md', `${audioSource}\n${source}`)
  for (const text of ['保留长引用，含 这段代码。', '原理说明', '保留折叠正文。', '标题插槽', '保留正文插槽和 行内术语。', '保留补充说明。', '分组里的解释。', '这里作者提供了一段代码示例。'])
    expect(article.narration).toContain(text)
  expect(article.narration).not.toMatch(/20rem|滚动区域标签|组件参数标题|结构化参数|点击操作|ref\(0\)|const grouped/)
  expect(article.podcast).toBe(article.narration)
})
