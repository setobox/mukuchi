import type { AlertTheme } from '#shared/content/alerts'
import type { NavigationItem } from './features/navigation/model'
import { publicSite } from '#shared/content/site'

const navigation: NavigationItem[] = [
  { kind: 'link', id: 'home', label: '首页', to: '/posts', icon: 'home', sections: ['posts'] },
  {
    kind: 'switcher',
    id: 'content',
    defaultChildId: 'categories',
    children: [
      { kind: 'link', id: 'categories', label: '分类', to: '/categories', icon: 'layers', sections: ['categories'] },
      { kind: 'link', id: 'tags', label: '标签', to: '/tags', icon: 'tags', sections: ['tags'] },
      { kind: 'link', id: 'archive', label: '归档', to: '/archive', icon: 'clock', sections: ['archive'] },
      { kind: 'link', id: 'series', label: '系列', to: '/series', icon: 'list', sections: ['series'] },
    ],
  },
  {
    kind: 'folder',
    id: 'my',
    label: '我的',
    to: '/my',
    icon: 'folder',
    sections: ['my'],
    description: '项目、收藏与日常使用的小工具。',
    children: [
      { kind: 'link', id: 'projects', label: '项目', to: '/projects', icon: 'code', sections: ['projects'], description: '我正在构建和维护的项目。', enabled: false },
      { kind: 'link', id: 'collections', label: '导航', to: '/collections', icon: 'grid', sections: ['collections'], description: '收藏的网站与资源。' },
      { kind: 'link', id: 'tools', label: '工具', to: '/tools', icon: 'shapes', sections: ['tools'], description: '制作文章封面，支持 PNG、SVG 和 WebP 导出。' },
    ],
  },
  { kind: 'link', id: 'about', label: '关于', to: '/about', icon: 'user', sections: ['about'] },
]

export default defineAppConfig({
  site: {
    ...publicSite,
    navigation,
    features: { search: true, commands: true },
    article: {
      notices: { wip: true, staleAfterDays: 365 as number | null },
      alerts: { theme: 'github' as AlertTheme },
    },
  },
})
