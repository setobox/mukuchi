export interface PaletteDestination { path: string, fullPath: string, hash: string }
export interface PaletteNavigation {
  current: () => PaletteDestination
  resolve: (target: string) => PaletteDestination
  push: (target: string) => Promise<boolean>
  onPageReady: (callback: () => void) => () => void
  afterLayout: () => Promise<void>
  scroll: (destination: PaletteDestination) => void | Promise<void>
}

export async function navigateFromPalette(target: string, navigation: PaletteNavigation) {
  const destination = navigation.resolve(target)
  let unsubscribe: (() => void) | undefined
  const ready = destination.path === navigation.current().path
    ? Promise.resolve()
    : new Promise<void>((resolve) => { unsubscribe = navigation.onPageReady(resolve) })
  try {
    if (!await navigation.push(target))
      throw new Error('页面跳转失败')
    await ready
    // Nuxt applies route scrolling and head attributes after page readiness.
    await navigation.afterLayout()
    if (navigation.current().fullPath === destination.fullPath)
      await navigation.scroll(destination)
  }
  finally {
    unsubscribe?.()
  }
}
