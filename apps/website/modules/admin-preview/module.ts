import process from 'node:process'
import { addTemplate, defineNuxtModule } from 'nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'mukuchi-admin-preview' },
  setup(_, nuxt) {
    nuxt.hook('modules:done', () => {
      const original = nuxt.options.build.templates.find(template => template.filename === 'mdc-highlighter.mjs')
      const generate = original?.getContents
      if (!original?.dst || !generate)
        throw new Error('后台预览需要 MDC 高亮模板')

      // Reuse MDC's languages, themes and transformers; only the preview's
      // regex engine differs when running on Cloudflare Workers.
      const preview = addTemplate({
        filename: 'admin-preview-highlighter.mjs',
        write: true,
        getContents: context => generate({
          ...context,
          options: {
            ...original.options,
            options: { ...original.options?.options, shikiEngine: 'javascript' },
          },
        }),
      })
      nuxt.options.alias['#admin-preview-highlighter'] = original.dst
      nuxt.hook('nitro:config', (config) => {
        const preset = process.env.NITRO_PRESET || config.preset || ''
        config.alias ||= {}
        config.alias['#admin-preview-highlighter'] = preset.includes('cloudflare') ? preview.dst : original.dst!
      })
    })
  },
})
