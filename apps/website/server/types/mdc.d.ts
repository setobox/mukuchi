declare module '#mdc-highlighter' {
  import type { RehypeHighlightOption } from '@nuxtjs/mdc'

  const highlighter: NonNullable<RehypeHighlightOption['highlighter']>
  export default highlighter
}
