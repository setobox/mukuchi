import type { PaletteNavigation } from '../app/features/commands/navigation'
import { expect, test, vi } from 'vite-plus/test'
import { navigateFromPalette } from '../app/features/commands/navigation'

function runtime(samePage = false) {
  const destination = { path: '/posts/example', fullPath: '/posts/example#章节', hash: '#章节' }
  let current = samePage ? { ...destination, fullPath: '/posts/example', hash: '' } : { path: '/tools', fullPath: '/tools', hash: '' }
  let pageReady: (() => void) | undefined
  let layoutReady: (() => void) | undefined
  const unsubscribe = vi.fn()
  const scroll = vi.fn()
  const navigation: PaletteNavigation = {
    current: () => current,
    resolve: () => destination,
    push: async () => {
      current = destination
      return true
    },
    onPageReady: (callback) => {
      pageReady = callback
      return unsubscribe
    },
    afterLayout: () => new Promise<void>((resolve) => { layoutReady = resolve }),
    scroll,
  }
  function interrupt() {
    current = { path: '/about', fullPath: '/about', hash: '' }
  }
  return { navigation, scroll, unsubscribe, destination, pageReady: () => pageReady?.(), layoutReady: () => layoutReady?.(), interrupt }
}

test('跨页跳转等待文章渲染与悬浮目录布局完成后再定位', async () => {
  const state = runtime()
  const pending = navigateFromPalette('/posts/example#章节', state.navigation)
  await Promise.resolve()
  expect(state.scroll).not.toHaveBeenCalled()
  state.pageReady()
  await Promise.resolve()
  expect(state.scroll).not.toHaveBeenCalled()
  state.layoutReady()
  await pending
  expect(state.scroll).toHaveBeenCalledWith(state.destination)
  expect(state.unsubscribe).toHaveBeenCalledOnce()
})

test('同页锚点不等待不存在的页面加载事件', async () => {
  const state = runtime(true)
  const pending = navigateFromPalette('/posts/example#章节', state.navigation)
  await Promise.resolve()
  await Promise.resolve()
  state.layoutReady()
  await pending
  expect(state.scroll).toHaveBeenCalledOnce()
  expect(state.unsubscribe).not.toHaveBeenCalled()
})

test('等待折叠展开和定位完成后才结束命令导航', async () => {
  const state = runtime(true)
  let finish!: () => void
  state.navigation.scroll = () => new Promise<void>((resolve) => {
    finish = resolve
  })
  const completed = vi.fn()
  const pending = navigateFromPalette('/posts/example#章节', state.navigation).then(completed)
  await Promise.resolve()
  await Promise.resolve()
  state.layoutReady()
  await Promise.resolve()
  expect(completed).not.toHaveBeenCalled()
  finish()
  await pending
  expect(completed).toHaveBeenCalledOnce()
})

test('失败释放页面监听，后续导航不会受到旧定位影响', async () => {
  const failed = runtime()
  failed.navigation.push = async () => false
  await expect(navigateFromPalette('/posts/example#章节', failed.navigation)).rejects.toThrow('页面跳转失败')
  expect(failed.unsubscribe).toHaveBeenCalledOnce()
  expect(failed.scroll).not.toHaveBeenCalled()

  const interrupted = runtime()
  const pending = navigateFromPalette('/posts/example#章节', interrupted.navigation)
  await Promise.resolve()
  interrupted.pageReady()
  await Promise.resolve()
  interrupted.interrupt()
  interrupted.layoutReady()
  await pending
  expect(interrupted.scroll).not.toHaveBeenCalled()
})
