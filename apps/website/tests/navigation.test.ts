import type { PageContext } from '../app/shared/navigation.ts'
import { expect, test } from 'vite-plus/test'
import { navigationDestinations, resolveNavigation } from '../app/features/navigation/model'
import { resolveBackTarget } from '../app/shared/navigation.ts'
import { context, navigation } from './fixtures/navigation'

const page: PageContext = {
  path: '/posts',
  section: 'posts',
  kind: 'index',
  title: '文章',
  parentPath: '/posts',
}

test('返回优先使用站内来源，直接访问或不安全来源回到所属列表', () => {
  const detail = { ...page, path: '/posts/example' }
  expect(resolveBackTarget('/categories/内容管理', detail)).toBe('/categories/内容管理')
  expect(resolveBackTarget('/tags/Vue', detail)).toBe('/tags/Vue')
  expect(resolveBackTarget(null, { ...page, path: '/categories/内容管理', parentPath: '/categories' })).toBe('/categories')
  for (const source of [
    null,
    'https://example.com',
    '//example.com',
    '/\\example.com',
    '/posts/example',
  ]) {
    expect(resolveBackTarget(source, detail)).toBe('/posts')
  }
})

test('动态分组在分类与标签详情匹配类型，首页和文章默认显示分类', () => {
  for (const current of [context(), context('posts', '/posts/example'), context('about', '/about')]) {
    const content = resolveNavigation(navigation, current).find(item => item.id === 'content')!
    expect(content).toMatchObject({ label: '分类', to: '/categories', active: false })
  }
  const categories = resolveNavigation(navigation, context('categories', '/categories/开发')).find(item => item.id === 'content')!
  expect(categories).toMatchObject({ label: '分类', current: 'location', active: true })
  const tags = resolveNavigation(navigation, context('tags', '/tags/C%23')).find(item => item.id === 'content')!
  expect(tags).toMatchObject({ label: '标签', to: '/tags', current: 'location', active: true })
  expect(tags.children.filter(item => item.active).map(item => item.id)).toEqual(['tags'])
  expect(resolveNavigation(navigation, context('tags', '/tags/'))[1]?.current).toBe('page')
  expect(resolveNavigation(navigation, context('tags', '/tags/C%23'))[0]?.active).toBe(false)
})

test('目录父项跟随子页面高亮，命令入口不重复动态分组的默认子项', () => {
  const my = resolveNavigation(navigation, context('tools', '/tools/cover')).find(item => item.id === 'my')!
  expect(my).toMatchObject({ label: '我的', to: '/my', active: true, current: undefined })
  expect(my.children).toHaveLength(1)
  expect(my.children[0]).toMatchObject({ id: 'tools', active: true })
  const entries = navigationDestinations(navigation)
  expect(entries.map(item => item.id)).toEqual(['home', 'categories', 'tags', 'my', 'tools'])
  expect(new Set(entries.map(item => item.id)).size).toBe(entries.length)
})

test('禁用与配置修改同步影响导航、目录和命令，空动态分组不会产生死链', () => {
  const changed = navigation.map(item => item.kind === 'link'
    ? { ...item, enabled: false }
    : {
        ...item,
        children: item.children.map(child => ({ ...child, label: `新${child.label}`, enabled: child.id === 'tools' })),
      })
  const resolved = resolveNavigation(changed, context('my', '/my'))
  expect(resolved.map(item => item.id)).toEqual(['my'])
  expect(resolved[0]?.children.map(item => item.label)).toEqual(['新工具'])
  expect(navigationDestinations(changed).map(item => item.label)).toEqual(['我的', '新工具'])
  expect(resolveNavigation([{ ...navigation[1]!, enabled: false }], context())).toEqual([])
})
