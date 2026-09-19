import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { AudioEnv, AudioWorkflowPayload } from './cloudflare'
import type { AudioSteps } from './engine'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import manifest from '#audio-manifest'
import { cloudflareAudioRepository } from './cloudflare'
import { runAudioJob } from './engine'

export class ArticleAudioWorkflow extends WorkflowEntrypoint<AudioEnv, AudioWorkflowPayload> {
  async run(event: WorkflowEvent<AudioWorkflowPayload>, step: WorkflowStep) {
    if (!this.env.AUDIO_ASSETS || !this.env.NUXT_AI_ENCRYPTION_KEY)
      throw new Error('Audio infrastructure is not configured')
    await runAudioJob({
      repo: cloudflareAudioRepository(this.env),
      bucket: this.env.AUDIO_ASSETS,
      secret: this.env.NUXT_AI_ENCRYPTION_KEY,
      manifest,
      id: event.payload.id,
      attempt: event.payload.attempt,
      step: step as unknown as AudioSteps,
    })
  }
}
