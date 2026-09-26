import { navigationDestinations, resolveNavigation } from '~/features/navigation/model'

export function useSiteNavigation() {
  const { site } = useAppConfig()
  const page = usePageContext()
  return {
    items: computed(() => resolveNavigation(site.navigation, page.value)),
    destinations: computed(() => navigationDestinations(site.navigation)),
  }
}
