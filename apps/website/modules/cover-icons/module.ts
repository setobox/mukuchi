import { join } from 'node:path'
import { defineNuxtModule } from 'nuxt/kit'
import { generateCoverIcons } from './generate'

export default defineNuxtModule({
  meta: { name: 'mukuchi-cover-icons' },
  async setup(_, nuxt) {
    const dir = join(nuxt.options.rootDir, '.data/cover-icons')
    await generateCoverIcons(nuxt.options.rootDir, dir)
    nuxt.hook('nitro:config', (config) => {
      config.publicAssets ||= []
      config.publicAssets.push({ dir, baseURL: '/_cover-icons', maxAge: 0 })
    })
  },
})
