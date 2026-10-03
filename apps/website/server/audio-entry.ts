import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types'
import type { AudioEnv } from './features/audio/cloudflare'
import manifest from '#audio-manifest'
import handler from '#audio-nitro-entry'
import { createTaskRepository } from './features/assistant/tasks'
import { dispatchAudio } from './features/audio/cloudflare'

export { ArticleAudioWorkflow } from './features/audio/workflow'
export default {
  ...handler,
  async scheduled(controller: ScheduledController, env: AudioEnv, context: ExecutionContext) {
    await handler.scheduled?.(controller, env, context)
    try {
      if (env.ADMIN_DB) {
        const binding = env.ADMIN_DB
        await createTaskRepository({ close() {}, async batch(statements) {
          const results = await binding.batch<Record<string, unknown>>(statements.map(item => binding.prepare(item.sql).bind(...(item.params ?? []))))
          if (results.some(result => !result.success))
            throw new Error('Task maintenance failed')
          return results.map(result => result.results)
        } }).maintain(Date.now())
      }
    }
    finally {
      await dispatchAudio(env, manifest)
    }
  },
}
