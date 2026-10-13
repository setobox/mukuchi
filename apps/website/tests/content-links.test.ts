import { expect, test, vi } from 'vite-plus/test'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ProseA from '../app/components/content/ProseA.vue'

vi.mock('#app', () => ({ useRoute: () => ({ fullPath: '/admin/preview/draft?session=editor#old' }) }))

test('正文锚点保留预览会话参数，普通文章链接保持原地址', async () => {
  const links: unknown[] = []
  const app = createSSRApp({ render: () => h('div', [h(ProseA, { href: '#heading' }), h(ProseA, { href: '#%E7%AC%AC%E4%BA%8C%E8%8A%82' }), h(ProseA, { href: '/posts/example' })]) })
  app.component('NuxtLink', defineComponent({
    props: ['to'],
    setup(props) {
      links.push(props.to)
      return () => h('a')
    },
  }))
  await renderToString(app)
  expect(links).toEqual(['/admin/preview/draft?session=editor#heading', '/admin/preview/draft?session=editor#%E7%AC%AC%E4%BA%8C%E8%8A%82', '/posts/example'])
})
