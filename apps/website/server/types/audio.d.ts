declare module '#audio-nitro-entry' {
  const handler: import('@cloudflare/workers-types').ExportedHandler<import('../features/audio/cloudflare').AudioEnv>
  export default handler
}

declare module 'cloudflare:workers' {
  export const WorkflowEntrypoint: typeof import('@cloudflare/workers-types').CloudflareWorkersModule.WorkflowEntrypoint
  export type WorkflowEvent<T = unknown> = import('@cloudflare/workers-types').CloudflareWorkersModule.WorkflowEvent<T>
  export type WorkflowStep = import('@cloudflare/workers-types').CloudflareWorkersModule.WorkflowStep
}
