export function usePostListActions() {
  const { isScrolled, scrollToTop } = useScrollToTop()
  useActionButton({
    id: 'home',
    icon: 'i-lucide-house',
    label: '返回文章列表',
    order: 10,
    async onClick() {
      await navigateTo('/posts')
    },
  })
  useActionButton({
    id: 'top',
    icon: 'i-lucide-chevron-up',
    label: '回到页面顶部',
    order: 40,
    visible: isScrolled,
    onClick: scrollToTop,
  })
}
