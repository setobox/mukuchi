import type { ThemePreference } from '~~/shared/theme/preference'
import { eventOrigin } from '~/features/theme/controller'

export function useSiteTheme() {
  const controller = useNuxtApp().$siteTheme
  return {
    preference: controller.preference,
    resolved: controller.resolved,
    unknown: controller.unknown,
    isTransitioning: controller.isTransitioning,
    setPreference: (value: ThemePreference, event?: MouseEvent) => controller.setPreference(value, eventOrigin(event)),
    cyclePreference: (event?: MouseEvent) => controller.cyclePreference(eventOrigin(event)),
  }
}
