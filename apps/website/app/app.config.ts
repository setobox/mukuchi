import type { NavigationItem } from './features/navigation/model'

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
      { kind: 'link', id: 'collections', label: '导航', to: '/collections', icon: 'grid', sections: ['collections'], description: '收藏的网站与资源。', enabled: false },
      { kind: 'link', id: 'tools', label: '工具', to: '/tools', icon: 'shapes', sections: ['tools'], description: '制作文章封面，支持 PNG、SVG 和 WebP 导出。' },
    ],
  },
  { kind: 'link', id: 'about', label: '关于', to: '/about', icon: 'user', sections: ['about'] },
]

export default defineAppConfig({
  site: {
    name: 'Setobox',
    description: '个人博客，提供文章阅读、专栏分类和工具入口。',
    owner: {
      name: '姬顶盒',
      avatar: 'https://q2.qlogo.cn/headimg_dl?dst_uin=1102778969&spec=0',
      description: '分享技术、工具与有趣的见闻。',
      introduction: [
        '欢迎来到我的博客！',
        '这里有开发、工具、游戏相关的技术见解和有趣的见闻。',
      ],
      signature: 'while(!dead) {\n  time--;\n  exp++;\n}',
      github: 'https://github.com/setobox',
    },
    navigation,
    features: { search: true, commands: true },
    article: { notices: { wip: true, staleAfterDays: 365 as number | null } },
  },
})
