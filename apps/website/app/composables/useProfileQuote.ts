import type { ProfileQuoteState } from '~/features/profile/quote'
import { computed, onMounted } from 'vue'
import { loadProfileQuote, profileQuoteFallback, profileQuoteUrl } from '~/features/profile/quote'

export function useProfileQuote() {
  const state = useState<ProfileQuoteState>('profile:quote', () => ({ status: 'idle', text: profileQuoteFallback }))

  onMounted(() => {
    void loadProfileQuote(state, () => $fetch<unknown>(profileQuoteUrl, { timeout: 3000, retry: 0 }))
  })

  return computed(() => state.value.text)
}
