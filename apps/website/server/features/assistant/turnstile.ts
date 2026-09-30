import type { Fetch } from './network'
import { z } from 'zod'
import { AssistantError } from '../../../shared/assistant/model'
import { boundedJson, withTimeout } from './network'

const responseSchema = z.object({ success: z.literal(true), hostname: z.string(), action: z.literal('assistant'), challenge_ts: z.string().datetime() })
export async function verifyTurnstile(input: { secret: string, token: string | undefined, hostname: string, ip: string }, signal: AbortSignal, fetcher: Fetch = fetch) {
  if (!input.token || !input.secret)
    throw new AssistantError(403, 'challenge_required', '请先完成人机验证')
  const token = input.token
  return withTimeout(signal, 5000, async (activeSignal) => {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      redirect: 'error',
      signal: activeSignal,
      body: new URLSearchParams({ secret: input.secret, response: token, ...(input.ip === 'unknown' ? {} : { remoteip: input.ip }) }),
    })
    const parsed = responseSchema.safeParse(await boundedJson(response))
    if (!parsed.success || parsed.data.hostname !== input.hostname || Date.parse(parsed.data.challenge_ts) < Date.now() - 300_000 || Date.parse(parsed.data.challenge_ts) > Date.now() + 30_000)
      throw new AssistantError(403, 'challenge_required', '人机验证已失效，请重试')
  }, '人机验证')
}
