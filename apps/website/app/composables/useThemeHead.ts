import type { ArticleAccent } from '~/features/theme/article'
import { accentVariables, themeSurfaces } from '~~/shared/theme/palette'
import { resolveTheme } from '~~/shared/theme/preference'
import { resolveArticleAccent } from '~/features/theme/article'

export function useThemeHead(errorPage = false) {
  const route = useRoute()
  const error = useError()
  const article = useState<ArticleAccent | null>('theme:article', () => null)
  const { preference, resolved, unknown } = useSiteTheme()
  const mode = computed(() => unknown.value ? resolveTheme(preference.value, null) : resolved.value)
  const accent = computed(() => resolveArticleAccent(article.value, route.path, errorPage || Boolean(error.value)))
  useHead(() => ({
    htmlAttrs: { 'data-accent': accent.value, 'style': accentVariables(accent.value) },
    meta: unknown.value && preference.value === 'system'
      ? []
      : [
          { name: 'theme-color', key: 'theme-color-dark', content: themeSurfaces[mode.value].canvas },
          { name: 'theme-color', key: 'theme-color-light', content: themeSurfaces[mode.value].canvas },
        ],
  }))
}
