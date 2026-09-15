import type { Ref } from 'vue'
import { z } from 'zod'

export const profileQuoteFallback = '开发、工具与游戏'
export const profileQuoteUrl = 'https://v1.hitokoto.cn/?encode=json&min_length=4&max_length=24'

export interface ProfileQuoteState {
  status: 'idle' | 'pending' | 'success' | 'error'
  text: string
}

const quoteSchema = z.object({ hitokoto: z.string().trim().min(4).max(24) })

export async function loadProfileQuote(state: Ref<ProfileQuoteState>, request: () => Promise<unknown>) {
  // The state belongs to this Nuxt app, so remounts share pending and settled requests.
  if (state.value.status !== 'idle')
    return

  state.value = { status: 'pending', text: profileQuoteFallback }
  try {
    const quote = quoteSchema.parse(await request())
    state.value = { status: 'success', text: quote.hitokoto }
  }
  catch {
    state.value = { status: 'error', text: profileQuoteFallback }
  }
}
