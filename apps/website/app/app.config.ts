export default defineAppConfig({
  site: {
    name: "mukuchi",
    description: "个人博客，提供文章阅读、专栏分类和工具入口。",
    owner: {
      name: "mukuchi",
      description: "负责本站的内容发布与维护。",
    },
    navigation: [
      { label: "文章", to: "/posts", icon: "notebook", section: "posts" },
      { label: "专栏", to: "/categories", icon: "layers", section: "categories" },
      { label: "工具", to: "/tools", icon: "shapes", section: "tools" },
      { label: "我的", to: "/about", icon: "user", section: "about" },
    ],
    features: { search: false, commands: false },
  },
});
