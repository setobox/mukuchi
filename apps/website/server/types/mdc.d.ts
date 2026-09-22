declare module '#admin-preview-highlighter' {
  import type { RehypeHighlightOption } from '@nuxtjs/mdc'

  const highlighter: NonNullable<RehypeHighlightOption['highlighter']>
  export default highlighter
}
