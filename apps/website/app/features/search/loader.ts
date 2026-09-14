import type { SearchDocument } from './model'
import { shallowReadonly, shallowRef } from 'vue'
import { prepareSearchDocuments } from './model'

export function createSearchLoader(fetchSections: () => Promise<unknown>) {
  const documents = shallowRef<SearchDocument[]>([])
  const status = shallowRef<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const error = shallowRef<unknown>()
  let pending: Promise<void> | undefined
  let generation = 0

  function load(): Promise<void> {
    if (pending)
      return pending
    if (status.value === 'ready')
      return Promise.resolve()
    const current = ++generation
    status.value = 'loading'
    error.value = undefined
    pending = Promise.resolve().then(fetchSections).then((value) => {
      if (current !== generation)
        return
      documents.value = prepareSearchDocuments(value)
      status.value = 'ready'
    }).catch((cause: unknown) => {
      if (current !== generation)
        return
      error.value = cause
      status.value = 'error'
    }).finally(() => {
      if (current === generation)
        pending = undefined
    })
    return pending
  }

  function reset() {
    generation++
    pending = undefined
    documents.value = []
    status.value = 'idle'
    error.value = undefined
  }
  return { documents: shallowReadonly(documents), status: shallowReadonly(status), error: shallowReadonly(error), load, reset }
}
