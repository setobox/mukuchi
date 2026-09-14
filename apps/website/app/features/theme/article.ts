import type { Ref } from 'vue'
import type { AccentColor } from '#shared/theme/palette'
import { defaultAccent, normalizeAccent } from '#shared/theme/palette'

export interface ArticleAccent { owner: string, path: string, color: AccentColor }

export function createArticleAccentScope(state: Ref<ArticleAccent | null>, owner: string, path: string) {
  return {
    update: (value: unknown) => { state.value = { owner, path, color: normalizeAccent(value) } },
    release: () => {
      if (state.value?.owner === owner)
        state.value = null
    },
  }
}

export function resolveArticleAccent(state: ArticleAccent | null, path: string, hasError = false): AccentColor {
  return !hasError && state?.path === path ? state.color : defaultAccent
}
