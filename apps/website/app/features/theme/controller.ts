import type { ResolvedTheme, ThemePreference } from '#shared/theme/preference'
import { computed, readonly, ref } from 'vue'
import { nextPreference, normalizePreference, resolveTheme } from '#shared/theme/preference'

export interface ThemeOrigin { x: number, y: number }
export interface ThemeTransition {
  ready: Promise<unknown>
  finished: Promise<unknown>
  skipTransition: () => void
}
export interface ThemeAnimation { finished: Promise<unknown>, cancel: () => void }
export interface ThemeControllerOptions {
  preference: () => unknown
  resolved: () => unknown
  unknown: () => boolean
  system: () => ResolvedTheme | null
  apply: (preference: ThemePreference) => Promise<void>
  canAnimate: () => boolean
  start?: (update: () => Promise<void>) => ThemeTransition
  animate?: (mode: ResolvedTheme, origin?: ThemeOrigin) => ThemeAnimation
  finish?: () => void
}

export function createThemeController(options: ThemeControllerOptions) {
  const isTransitioning = ref(false)
  const preference = computed(() => normalizePreference(options.preference()))
  const resolved = computed(() => options.resolved() === 'light' ? 'light' : 'dark')
  let cancelCurrent: (() => void) | undefined

  async function setPreference(value: ThemePreference, origin?: ThemeOrigin) {
    if (isTransitioning.value || options.unknown())
      return
    const next = normalizePreference(value)
    const target = resolveTheme(next, options.system())
    if (target === resolved.value || !options.canAnimate() || !options.start || !options.animate) {
      await options.apply(next)
      return
    }

    isTransitioning.value = true
    let committed = false
    let cancelled = false
    let transition: ThemeTransition | undefined
    let animation: ThemeAnimation | undefined
    const apply = async () => {
      if (!committed) {
        committed = true
        await options.apply(next)
      }
    }
    cancelCurrent = () => {
      cancelled = true
      transition?.skipTransition()
      animation?.cancel()
    }
    try {
      transition = options.start(apply)
      const finished = transition.finished.catch(() => undefined)
      await transition.ready
      if (!cancelled) {
        animation = options.animate(target, origin)
        await animation.finished
      }
      await finished
    }
    catch {
      transition?.skipTransition()
      await apply()
    }
    finally {
      animation?.cancel()
      options.finish?.()
      cancelCurrent = undefined
      isTransitioning.value = false
    }
  }

  return {
    preference,
    resolved,
    unknown: computed(options.unknown),
    isTransitioning: readonly(isTransitioning),
    setPreference,
    cyclePreference: (origin?: ThemeOrigin) => setPreference(nextPreference(preference.value), origin),
    cancel: () => cancelCurrent?.(),
  }
}

export function circleMask(origin: ThemeOrigin, width: number, height: number): [string, string] {
  const x = Math.max(0, Math.min(width, origin.x))
  const y = Math.max(0, Math.min(height, origin.y))
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y))
  return [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
}

export function eventOrigin(event?: MouseEvent): ThemeOrigin | undefined {
  if (!event)
    return
  if (event.detail > 0)
    return { x: event.clientX, y: event.clientY }
  const target = event.currentTarget
  if (target instanceof HTMLElement) {
    const rect = target.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }
}
