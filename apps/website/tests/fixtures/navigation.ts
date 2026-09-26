import type { NavigationItem } from '../../app/features/navigation/model'
import type { PageContext, SiteSection } from '../../app/shared/navigation'

export const navigation: NavigationItem[] = [
  { kind: 'link', id: 'home', label: '首页', to: '/posts', icon: 'home', sections: ['posts'] },
  {
    kind: 'switcher',
    id: 'content',
    defaultChildId: 'categories',
    children: [
      { kind: 'link', id: 'categories', label: '分类', to: '/categories', icon: 'layers', sections: ['categories'] },
      { kind: 'link', id: 'tags', label: '标签', to: '/tags', icon: 'tags', sections: ['tags'] },
      { kind: 'link', id: 'archive', label: '归档', to: '/archive', icon: 'clock', sections: ['archive'], enabled: false },
    ],
  },
  {
    kind: 'folder',
    id: 'my',
    label: '我的',
    to: '/my',
    icon: 'folder',
    sections: ['my'],
    children: [
      { kind: 'link', id: 'tools', label: '工具', to: '/tools', icon: 'shapes', sections: ['tools'], description: '制作封面与日常小工具。' },
      { kind: 'link', id: 'projects', label: '项目', to: '/projects', icon: 'code', sections: ['projects'], enabled: false },
    ],
  },
]

export function context(section: SiteSection = 'posts', path = '/posts'): PageContext {
  return { section, path, kind: 'index', title: '', parentPath: '/posts' }
}
