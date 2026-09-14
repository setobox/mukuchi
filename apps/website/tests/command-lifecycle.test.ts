// @vitest-environment happy-dom
import { expect, test, vi } from 'vite-plus/test'
import { createApp, defineComponent, h, inject, nextTick, provide, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SearchHighlight from '../app/components/search/SearchHighlight.vue'
import { useCommand } from '../app/composables/useCommandPalette'
import { commandControllerKey, createCommandController } from '../app/features/commands/controller'

test('局部命令随组件卸载注销，重新挂载不残留重复注册', async () => {
  const palette = createCommandController(() => ({ search: true, commands: true }))
  const visible = ref(true)
  const child = defineComponent({
    setup() {
      useCommand({ id: 'local', label: '局部命令', keywords: [], icon: 'code', execute: () => {} })
      return () => h('span')
    },
  })
  const host = document.createElement('div')
  const app = createApp({
    setup() {
      provide(commandControllerKey, palette)
      return () => visible.value ? h(child) : null
    },
  })
  try {
    app.mount(host)
    expect(palette.commands.value.map(command => command.id)).toEqual(['local'])
    visible.value = false
    await nextTick()
    expect(palette.commands.value).toEqual([])
    visible.value = true
    await nextTick()
    expect(palette.commands.value).toHaveLength(1)
  }
  finally {
    app.unmount()
  }
  expect(palette.commands.value).toEqual([])
})

test('高亮组件将 HTML 转义为文本，不生成可执行节点', async () => {
  const html = await renderToString(h(SearchHighlight, { text: '<script>alert(1)</script>', query: 'alert' }))
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('>alert</mark>')
  expect(html).not.toContain('<script>')
})

test('命令模块热重载后，新消费者仍能取得已有应用的控制器', async () => {
  const palette = createCommandController(() => ({ search: true, commands: true }))
  vi.resetModules()
  const reloaded = await import('../app/features/commands/controller')
  let received: unknown
  const child = defineComponent({
    setup() {
      received = inject(reloaded.commandControllerKey)
      return () => null
    },
  })
  const app = createApp({
    setup() {
      provide(commandControllerKey, palette)
      return () => h(child)
    },
  })
  try {
    app.mount(document.createElement('div'))
    expect(received).toBe(palette)
  }
  finally {
    app.unmount()
  }
})
