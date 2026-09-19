import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types'
import type { AudioEnv } from './features/audio/cloudflare'
import manifest from '#audio-manifest'
import handler from '#audio-nitro-entry'
import { dispatchAudio } from './features/audio/cloudflare'

export { ArticleAudioWorkflow } from './features/audio/workflow'
export default {
  ...handler,
  async scheduled(controller: ScheduledController, env: AudioEnv, context: ExecutionContext) {
    await handler.scheduled?.(controller, env, context)
    await dispatchAudio(env, manifest)
  },
}
