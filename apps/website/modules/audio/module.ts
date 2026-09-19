import type { AudioManifest } from '../../shared/audio/model'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { addTemplate, defineNuxtModule } from 'nuxt/kit'
import { markdownFiles } from '../../content/ai/source'
import { postsRoot } from '../../content/validation'
import { audioArticle } from '../../server/features/audio/content'
import { digest } from '../../shared/ai/model'

export default defineNuxtModule({
  meta: { name: 'mukuchi-audio' },
  async setup(_, nuxt) {
    // Only read local published sources. Never call a provider during build or dev.
    const articles = await Promise.all((await markdownFiles(postsRoot)).map(async path => audioArticle(path, await readFile(join(postsRoot, path), 'utf8'))))
    const manifest: AudioManifest = { revision: process.env.GITHUB_SHA || await digest(JSON.stringify(articles)), articles }
    const template = addTemplate({ filename: 'audio-manifest.ts', write: true, getContents: () => `export default ${JSON.stringify({ ...manifest, serverOnly: 'mukuchi-audio-manifest-v1' })}\n` })
    nuxt.options.alias['#audio-manifest'] = template.dst
    // Keep the full text on the server; it must never enter the browser bundle.
    nuxt.hook('nitro:config', (config) => {
      config.alias ||= {}
      config.alias['#audio-manifest'] = template.dst
    })
    nuxt.hook('nitro:init', (nitro) => {
      if (!nuxt.options.dev && nitro.options.preset.includes('cloudflare')) {
        nitro.options.alias['#audio-nitro-entry'] = nitro.options.entry
        nitro.options.entry = fileURLToPath(new URL('../../server/audio-entry.ts', import.meta.url))
      }
    })
  },
})
