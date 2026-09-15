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
      signature: 'while(!dead) { time--; exp++; }',
      github: 'https://github.com/setobox',
    },
    navigation: [
      { label: '文章', to: '/posts', icon: 'notebook', section: 'posts' },
      { label: '专栏', to: '/categories', icon: 'layers', section: 'categories' },
      { label: '工具', to: '/tools', icon: 'shapes', section: 'tools' },
      { label: '关于', to: '/about', icon: 'user', section: 'about' },
    ],
    features: { search: true, commands: true },
    article: { notices: { wip: true, staleAfterDays: 365 as number | null } },
  },
})
