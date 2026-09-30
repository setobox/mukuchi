export function usePostListActions() {
  const { isScrolled, scrollToTop } = useScrollToTop()
  useActionButton({
    id: 'top',
    icon: 'i-lucide-chevron-up',
    label: '回到页面顶部',
    order: 40,
    visible: isScrolled,
    onClick: scrollToTop,
  })
}
