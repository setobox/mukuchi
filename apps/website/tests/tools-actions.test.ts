// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue'
import { useActionButton, useProvideActionButtons } from '../app/composables/useActionButton'
import ToolsPage from '../app/pages/tools.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
})

function mountTools(path = '/tools') {
  const route = reactive({ path })
  const visible = ref(true)
  const child = ref('工具列表')
  const isScrolled = ref(false)
  const scrollToTop = vi.fn()
  const navigateTo = vi.fn()
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useActionButton', useActionButton)
  vi.stubGlobal('useScrollToTop', () => ({ isScrolled, scrollToTop }))
  vi.stubGlobal('navigateTo', navigateTo)
  let state!: ReturnType<typeof useProvideActionButtons>
  const app = createApp(defineComponent({
    setup() {
      state = useProvideActionButtons()
      return () => visible.value ? h(ToolsPage) : null
    },
  }))
  app.component('NuxtPage', defineComponent({ setup: () => () => h('main', child.value) }))
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return { ...state, route, visible, child, isScrolled, scrollToTop, navigateTo, host }
}

test('工具页注册统一返回入口，回顶按钮随滚动显示并执行相应操作', async () => {
  const { actions, isScrolled, navigateTo, scrollToTop } = mountTools()
  expect(actions.value.map(action => action.label)).toEqual(['返回文章列表'])
  await actions.value[0]!.onClick()
  expect(navigateTo).toHaveBeenCalledWith('/posts')
  isScrolled.value = true
  expect(actions.value.map(action => action.label)).toEqual(['返回文章列表', '回到页面顶部'])
  await actions.value[1]!.onClick()
  expect(scrollToTop).toHaveBeenCalledOnce()
  isScrolled.value = false
  expect(actions.value.map(action => action.id)).toEqual(['home'])
})

test('工具子页提供返回工具列表，列表及尾斜杠路径隐藏自身入口', async () => {
  const { actions, route, navigateTo } = mountTools('/tools/cover')
  expect(actions.value.map(action => action.label)).toEqual(['返回文章列表', '返回工具列表'])
  await actions.value[1]!.onClick()
  expect(navigateTo).toHaveBeenCalledWith('/tools')
  for (const path of ['/tools', '/tools/']) {
    route.path = path
    expect(actions.value.map(action => action.id)).toEqual(['home'])
  }
  route.path = '/tools/another-tool'
  expect(actions.value.map(action => action.id)).toEqual(['home', 'back'])
})

test('切换工具子页不重复注册，离开工具页清理，再次进入恢复', async () => {
  const { actions, route, visible, child, isScrolled, host } = mountTools()
  isScrolled.value = true
  for (const { path, title } of [{ path: '/tools/cover', title: '封面制作器' }, { path: '/tools', title: '工具列表' }, { path: '/tools/new', title: '新增工具' }]) {
    route.path = path
    child.value = title
    await nextTick()
    expect(host.textContent).toBe(title)
    expect(actions.value.map(action => action.id)).toEqual(path === '/tools' ? ['home', 'top'] : ['home', 'back', 'top'])
  }
  visible.value = false
  await nextTick()
  expect(actions.value).toEqual([])
  visible.value = true
  await nextTick()
  expect(actions.value.map(action => action.id)).toEqual(['home', 'back', 'top'])
})
