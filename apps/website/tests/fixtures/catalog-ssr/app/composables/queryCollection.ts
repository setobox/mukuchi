import type { PostSummary } from '#shared/content/schema'

// Only the data boundary is replaced: useAsyncData and SSR run inside Nuxt.
export function queryCollection(_collection: string) {
  const calls = useState('calls', () => 0)
  const failure = useState('failure', () => 0)
  const request = useRequestURL().searchParams.get('request') ?? 'default'
  return {
    select(..._fields: string[]) {
      return this
    },
    async all(): Promise<PostSummary[]> {
      const version = ++calls.value
      await new Promise(resolve => setTimeout(resolve, 5))
      if (failure.value === version)
        throw new Error(`query ${version} failed`)
      return [{ path: '/posts/test', title: `${request}:${version}`, description: '', publish: '2024-02-29', wordCount: 0, tags: ['A'], categories: ['B'], pin: 0, wip: false, theme: '#a369ff' }]
    },
  }
}
