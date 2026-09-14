import type { Command, PaletteFeatures } from '../app/features/commands/controller'
import { expect, test, vi } from 'vite-plus/test'
import { ref } from 'vue'
import { acceptsPaletteShortcut, createCommandController, nextSelection, paletteInputAction } from '../app/features/commands/controller'

const command: Command = { id: 'search', label: '搜索文章', icon: 'search', keywords: ['search'], execute: () => {} }

test('分类合并非相邻注册项，过滤后仍按分组显示顺序选择命令', () => {
  const palette = createCommandController(() => ({ search: true, commands: true }))
  for (const [id, category] of [['page-a', '页面'], ['theme', '主题'], ['page-b', '页面']] as const)
    palette.register({ ...command, id, category, keywords: [id] })
  expect(palette.commands.value.map(item => item.id)).toEqual(['page-a', 'page-b', 'theme'])
  palette.query.value = '>page'
  expect(palette.commands.value.map(item => item.id)).toEqual(['page-a', 'page-b'])
})

test('命令输入隐藏模式前缀，清空关键词仍保留命令模式', () => {
  const palette = createCommandController(() => ({ search: true, commands: true }))
  palette.open('commands')
  expect(palette.inputQuery.value).toBe('')
  palette.inputQuery.value = '主题'
  expect(palette.commandQuery.value).toBe('主题')
  expect(palette.inputQuery.value).toBe('主题')
  palette.inputQuery.value = ''
  expect(palette.mode.value).toBe('commands')
  palette.open('search')
  palette.inputQuery.value = '>页面'
  expect(palette.mode.value).toBe('commands')
  expect(palette.inputQuery.value).toBe('页面')
  palette.open('search')
  expect(palette.inputQuery.value).toBe('')
  expect(palette.mode.value).toBe('search')
})

test('打开重置查询，输入大于号切换命令模式，删除后恢复搜索', () => {
  const palette = createCommandController(() => ({ search: true, commands: true }))
  palette.open('search')
  expect(palette.isOpen.value).toBe(true)
  palette.query.value = '> SEARCH'
  expect(palette.mode.value).toBe('commands')
  palette.query.value = 'Nuxt'
  expect(palette.mode.value).toBe('search')
  palette.close()
  palette.open('commands')
  expect(palette.query.value).toBe('>')
  palette.open('search')
  expect(palette.query.value).toBe('')
})

test('独立功能开关决定入口回退，两者关闭时不打开', () => {
  for (const features of [{ search: true, commands: false }, { search: false, commands: true }, { search: false, commands: false }]) {
    const palette = createCommandController(() => features)
    palette.open('search')
    expect(palette.isOpen.value).toBe(features.search || features.commands)
    if (features.commands)
      expect(palette.mode.value).toBe('commands')
    palette.open('commands')
    if (features.search)
      expect(palette.mode.value).toBe('search')
  }
})

test('命令注册拒绝重复 ID，注销幂等且实例互不影响', () => {
  const features: PaletteFeatures = { search: true, commands: true }
  const palette = createCommandController(() => features)
  const stop = palette.register(command)
  expect(() => palette.register(command)).toThrow('命令 ID 重复')
  expect(createCommandController(() => features).commands.value).toEqual([])
  stop()
  stop()
  expect(palette.commands.value).toEqual([])
})

test('命令支持关键词过滤和响应式可用状态', () => {
  const enabled = ref(false)
  const execute = vi.fn()
  const palette = createCommandController(() => ({ search: true, commands: true }))
  palette.register({ ...command, available: enabled, status: () => enabled.value ? '' : '当前设置', execute })
  palette.query.value = '> SEARCH 文章'
  expect(palette.commands.value[0]?.available).toBe(false)
  expect(palette.commands.value[0]?.status).toBe('当前设置')
  enabled.value = true
  expect(palette.commands.value[0]?.available).toBe(true)
  palette.query.value = '> 不存在'
  expect(palette.commands.value).toEqual([])
  expect(execute).not.toHaveBeenCalled()
})

test('方向键循环跳过禁用项，空结果和全部禁用返回无选择', () => {
  expect(nextSelection(-1, 1, [false, true, true])).toBe(1)
  expect(nextSelection(2, 1, [false, true, true])).toBe(1)
  expect(nextSelection(1, -1, [false, true, true])).toBe(2)
  expect(nextSelection(-1, -1, [true, false, true])).toBe(2)
  expect(nextSelection(0, 1, [])).toBe(-1)
  expect(nextSelection(0, 1, [false])).toBe(-1)
})

test('快捷键保护输入法、其他弹窗和编辑区域，面板内保留聚焦行为', () => {
  const event = { key: 'p', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false, repeat: false, defaultPrevented: false }
  const context = { enabled: true, open: false, editable: false, otherDialog: false }
  expect(acceptsPaletteShortcut(event, context)).toBe(true)
  expect(acceptsPaletteShortcut({ ...event, ctrlKey: false, metaKey: true }, context)).toBe(true)
  for (const key of ['isComposing', 'repeat', 'defaultPrevented', 'altKey', 'shiftKey'] as const)
    expect(acceptsPaletteShortcut({ ...event, [key]: true }, context)).toBe(false)
  expect(acceptsPaletteShortcut(event, { ...context, editable: true })).toBe(false)
  expect(acceptsPaletteShortcut(event, { ...context, open: true, editable: true })).toBe(true)
  expect(acceptsPaletteShortcut(event, { ...context, open: true, otherDialog: true })).toBe(false)
  expect(acceptsPaletteShortcut(event, { ...context, enabled: false })).toBe(false)
})

test('输入法确认和候选选择不执行命令或改变选项', () => {
  for (const key of ['Enter', 'ArrowDown', 'ArrowUp']) {
    expect(paletteInputAction({ key, isComposing: true, keyCode: 0 }, false)).toBeUndefined()
    expect(paletteInputAction({ key, isComposing: false, keyCode: 229 }, false)).toBeUndefined()
    expect(paletteInputAction({ key, isComposing: false, keyCode: 0 }, true)).toBeUndefined()
  }
  expect(paletteInputAction({ key: 'Enter', isComposing: false, keyCode: 13 }, false)).toBe('execute')
  expect(paletteInputAction({ key: 'ArrowDown', isComposing: false, keyCode: 40 }, false)).toBe('next')
  expect(paletteInputAction({ key: 'Tab', isComposing: false, keyCode: 9 }, false)).toBeUndefined()
})
