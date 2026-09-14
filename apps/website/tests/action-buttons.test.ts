import type { VNode } from 'vue'
import type { ActionButton } from '../app/composables/useActionButton.ts'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import { computed, createRenderer, createSSRApp, defineComponent, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  useActionButton,
  useActionButtons,
  useProvideActionButtons,
} from '../app/composables/useActionButton.ts'

// Exercise real Vue injection and lifecycles without a browser or DOM dependency.
interface TestNode {
  parent: TestNode | null
  children: TestNode[]
}
const createNode = (): TestNode => ({ parent: null, children: [] })
function removeNode(node: TestNode): void {
  if (node.parent)
    node.parent.children.splice(node.parent.children.indexOf(node), 1)
  node.parent = null
}
const renderer = createRenderer<TestNode, TestNode>({
  createElement: createNode,
  createText: createNode,
  createComment: createNode,
  insert(node, parent, anchor) {
    removeNode(node)
    const index = anchor ? parent.children.indexOf(anchor) : parent.children.length
    parent.children.splice(index, 0, node)
    node.parent = parent
  },
  remove: removeNode,
  parentNode: node => node.parent,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp() {},
  setText() {},
  setElementText() {},
})

function mountProvider(render: () => VNode = () => h('div')) {
  let state!: ReturnType<typeof useActionButtons>
  const app = renderer.createApp(
    defineComponent({
      setup() {
        state = useProvideActionButtons()
        return render
      },
    }),
  )
  app.mount(createNode())
  onTestFinished(() => app.unmount())
  return state
}

function consumer(setup: () => void) {
  return defineComponent({
    setup() {
      setup()
      return () => h('span')
    },
  })
}

function action(id: string, options: Partial<ActionButton> = {}): ActionButton {
  return { id, icon: 'i-lucide-house', label: id, onClick: vi.fn(), ...options }
}

test('按 order 排序，同序及省略顺序时保持注册顺序', () => {
  const { actions, registerAction } = mountProvider()
  registerAction(action('last', { order: 40 }))
  registerAction(action('default-first'))
  registerAction(action('default-second'))
  registerAction(action('equal-first', { order: 10 }))
  registerAction(action('equal-second', { order: 10 }))
  registerAction(action('first', { order: -1 }))
  expect(actions.value.map(item => item.id)).toEqual([
    'first',
    'default-first',
    'default-second',
    'equal-first',
    'equal-second',
    'last',
  ])
})

test('visible 支持布尔值、ref、computed 和 getter，并响应变化', () => {
  const { actions, registerAction } = mountProvider()
  const visible = ref(false)
  registerAction(action('always'))
  registerAction(action('hidden', { visible: false }))
  registerAction(action('ref', { visible }))
  registerAction(action('computed', { visible: computed(() => visible.value) }))
  registerAction(action('getter', { visible: () => visible.value }))
  expect(actions.value.map(item => item.id)).toEqual(['always'])
  visible.value = true
  expect(actions.value.map(item => item.id)).toEqual(['always', 'ref', 'computed', 'getter'])
  visible.value = false
  expect(actions.value.map(item => item.id)).toEqual(['always'])
})

test('同 ID 替换回调，旧注销函数不会删除新注册项', async () => {
  const { actions, registerAction } = mountProvider()
  const oldClick = vi.fn()
  const newClick = vi.fn(async () => {})
  const stopOld = registerAction(action('home', { onClick: oldClick }))
  const stopNew = registerAction(action('home', { label: '新页面', onClick: newClick }))
  stopOld()
  stopOld()
  expect(actions.value).toHaveLength(1)
  expect(actions.value[0]?.label).toBe('新页面')
  await actions.value[0]?.onClick()
  expect(newClick).toHaveBeenCalledOnce()
  expect(oldClick).not.toHaveBeenCalled()
  stopNew()
  stopNew()
  expect(actions.value).toEqual([])
})

test('组件挂载才注册，卸载自动清理', async () => {
  const visible = ref(true)
  const Page = consumer(() => {
    const { actions } = useActionButtons()
    useActionButton(action('home'))
    expect(actions.value).toEqual([])
  })
  const { actions } = mountProvider(() => (visible.value ? h(Page) : h('div')))
  expect(actions.value.map(item => item.id)).toEqual(['home'])
  visible.value = false
  await nextTick()
  expect(actions.value).toEqual([])
})

test('挂载前停止后不再注册，挂载后手动停止可重复调用', () => {
  let stop!: () => void
  const Page = consumer(() => {
    const stopEarly = useActionButton(action('cancelled'))
    stopEarly()
    stopEarly()
    stop = useActionButton(action('active'))
  })
  const { actions } = mountProvider(() => h(Page))
  expect(actions.value.map(item => item.id)).toEqual(['active'])
  stop()
  stop()
  expect(actions.value).toEqual([])
})

test('新旧页面重叠挂载时，旧页面卸载不影响新页面按钮', async () => {
  const oldVisible = ref(true)
  const newVisible = ref(false)
  const OldPage = consumer(() => {
    useActionButton(action('home', { label: '旧页面' }))
    useActionButton(action('back'))
  })
  const NewPage = consumer(() => useActionButton(action('home', { label: '新页面' })))
  const { actions } = mountProvider(() =>
    h('div', [oldVisible.value ? h(OldPage) : null, newVisible.value ? h(NewPage) : null]),
  )
  newVisible.value = true
  await nextTick()
  oldVisible.value = false
  await nextTick()
  expect(actions.value.map(item => item.label)).toEqual(['新页面'])
  newVisible.value = false
  await nextTick()
  expect(actions.value).toEqual([])
})

test('各 provider 拥有独立状态', () => {
  const first = mountProvider()
  const second = mountProvider()
  first.registerAction(action('home'))
  expect(second.actions.value).toEqual([])
  second.registerAction(action('top'))
  expect(first.actions.value.map(item => item.id)).toEqual(['home'])
  expect(second.actions.value.map(item => item.id)).toEqual(['top'])
})

test('没有 provider 时明确报错', () => {
  const app = renderer.createApp(
    consumer(() => {
      expect(() => useActionButtons()).toThrow(
        'Action buttons must be used below useProvideActionButtons().',
      )
    }),
  )
  app.mount(createNode())
  onTestFinished(() => app.unmount())
})

test('SSR 不注册挂载后的操作，也不污染后续请求', async () => {
  const Page = consumer(() => useActionButton(action('home')))
  for (let request = 0; request < 2; request++) {
    let state!: ReturnType<typeof useActionButtons>
    const app = createSSRApp({
      setup() {
        state = useProvideActionButtons()
        return () => h(Page)
      },
    })
    await renderToString(app)
    expect(state.actions.value).toEqual([])
  }
})
