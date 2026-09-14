import type { MaybeRefOrGetter } from 'vue'
import type { ArticleAccent } from '~/features/theme/article'
import { createArticleAccentScope } from '~/features/theme/article'

export function useArticleTheme(path: string, color: MaybeRefOrGetter<unknown>) {
  const state = useState<ArticleAccent | null>('theme:article', () => null)
  const scope = createArticleAccentScope(state, useId(), path)
  watchEffect(() => scope.update(toValue(color)))
  onScopeDispose(scope.release)
}
