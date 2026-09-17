import { expect, test } from 'vite-plus/test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import BaseUiProvider from '../app/components/base/BaseUiProvider.vue'

test('没有浏览器 CSS 接口时页面仍可服务端渲染', async () => {
  const app = createSSRApp({ render: () => h(BaseUiProvider, null, { default: () => h('main', '页面内容') }) })
  expect(await renderToString(app)).toContain('<main>页面内容</main>')
})
