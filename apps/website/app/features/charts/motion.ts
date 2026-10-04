export interface ChartMotion {
  progress: () => number
  cancel: () => void
  finished: Promise<void>
}

export function startChartMotion(options: {
  track: HTMLElement
  cursor: SVGElement
  endpoint: HTMLElement
  distance: number
  fromY: number
  toY: number
  duration: number
  progress?: number
}): ChartMotion {
  const { track, cursor, endpoint, distance, fromY, toY, duration } = options
  const animations: Animation[] = []
  try {
    for (const element of [track, cursor]) {
      animations.push(element.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${-distance}px)` }], { duration, easing: 'linear', fill: 'both' }))
    }
    animations.push(endpoint.animate([{ transform: `translateY(${fromY}px)` }, { transform: `translateY(${toY}px)` }], { duration, easing: 'cubic-bezier(0.5, 0, 0.5, 1)', fill: 'both' }))
    for (const animation of animations) {
      animation.currentTime = (options.progress ?? 0) * duration
      // Every native animation rejects when cancelled, including the two followers.
      void animation.finished.catch(() => undefined)
    }
    return {
      progress: () => Math.max(0, Math.min(1, Number(animations[0]!.currentTime ?? 0) / duration || 0)),
      cancel: () => animations.forEach(animation => animation.cancel()),
      finished: animations[0]!.finished.then(() => undefined),
    }
  }
  catch (cause) {
    animations.forEach((animation) => {
      void animation.finished.catch(() => undefined)
      animation.cancel()
    })
    throw cause
  }
}
