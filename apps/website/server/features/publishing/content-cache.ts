// Only immutable Git blobs are cached. Callers must first read the current,
// authenticated repository tree; branch heads and draft contents are never cached.
export function createGithubContentCache(maxBytes = 8 * 1024 * 1024) {
  const entries = new Map<string, { source: string, bytes: number }>()
  let bytes = 0
  return {
    get(repository: string, sha: string) {
      const key = `${repository}:${sha}`
      const entry = entries.get(key)
      if (entry) {
        entries.delete(key)
        entries.set(key, entry)
      }
      return entry?.source
    },
    set(repository: string, sha: string, source: string) {
      const key = `${repository}:${sha}`
      const size = (key.length + source.length) * 2
      const previous = entries.get(key)
      if (previous) {
        bytes -= previous.bytes
        entries.delete(key)
      }
      if (size > maxBytes)
        return
      while (bytes + size > maxBytes && entries.size) {
        const [oldest, entry] = entries.entries().next().value!
        entries.delete(oldest)
        bytes -= entry.bytes
      }
      entries.set(key, { source, bytes: size })
      bytes += size
    },
  }
}
