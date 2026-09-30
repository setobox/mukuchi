import { z } from 'zod'

export const storeNames = ['conversations', 'messages', 'preferences'] as const
export type StoreName = typeof storeNames[number]
type Key = string[]
export interface LocalTransaction {
  get: (store: StoreName, key: Key) => Promise<unknown>
  all: (store: StoreName, namespace: string) => Promise<unknown[]>
  put: (store: StoreName, value: object) => Promise<void>
  remove: (store: StoreName, key: Key) => Promise<void>
}
export interface LocalDatabase {
  run: <T>(write: boolean, operation: (tx: LocalTransaction) => Promise<T>) => Promise<T>
  close: () => void
}
export class LocalHistoryConflict extends Error {
  constructor() { super('会话已在其他窗口修改或删除，请刷新列表后重试') }
}

function requested<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// The caller supplies the browser's factory; importing this module during SSR opens nothing.
export async function openHistoryDatabase(factory: IDBFactory, name = 'setobox-assistant'): Promise<LocalDatabase> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const opening = factory.open(name, 1)
    let abandoned = false
    opening.onblocked = () => {
      abandoned = true
      reject(new Error('历史数据库正在被其他标签页使用，请关闭旧标签页后刷新'))
    }
    opening.onerror = () => reject(opening.error)
    opening.onupgradeneeded = () => {
      const database = opening.result
      for (const store of storeNames) {
        const table = database.createObjectStore(store, { keyPath: ['namespace', 'id'] })
        table.createIndex('namespace', 'namespace')
        if (store === 'conversations')
          table.createIndex('activity', ['namespace', 'updatedAt'])
        if (store === 'messages')
          table.createIndex('conversation', ['namespace', 'conversationId', 'createdAt', 'id'])
      }
    }
    opening.onsuccess = () => {
      if (abandoned) {
        opening.result.close()
        return
      }
      resolve(opening.result)
    }
  })
  db.onversionchange = () => db.close()
  return {
    async run(write, operation) {
      const transaction = db.transaction([...storeNames], write ? 'readwrite' : 'readonly')
      const done = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error ?? new Error('本地历史事务已中止'))
        transaction.onerror = () => { /* onabort settles the transaction. */ }
      })
      // Avoid an unhandled rejection if a request fails before we await the transaction.
      void done.catch(() => {})
      const tx: LocalTransaction = {
        get: (store, key) => requested(transaction.objectStore(store).get(key)),
        all: (store, namespace) => requested(transaction.objectStore(store).index('namespace').getAll(namespace)),
        put: async (store, value) => { await requested(transaction.objectStore(store).put(value)) },
        remove: async (store, key) => { await requested(transaction.objectStore(store).delete(key)) },
      }
      try {
        const value = await operation(tx)
        await done
        return value
      }
      catch (error) {
        try {
          transaction.abort()
        }
        catch { /* A failed transaction may already be aborted. */ }
        await done.catch(() => {})
        throw error
      }
    },
    close: () => db.close(),
  }
}

const rowKey = z.object({ namespace: z.string(), id: z.string() })
export function memoryHistoryDatabase(): LocalDatabase {
  let data = new Map<StoreName, Map<string, object>>(storeNames.map(store => [store, new Map()]))
  let tail = Promise.resolve()
  return {
    async run(write, operation) {
      const before = tail
      let release: () => void = () => {}
      tail = new Promise<void>((resolve) => {
        release = resolve
      })
      await before
      const working = new Map([...data].map(([store, rows]) => [store, new Map(rows)]))
      const tx: LocalTransaction = {
        get: async (store, key) => structuredClone(working.get(store)!.get(JSON.stringify(key))),
        all: async (store, namespace) => [...working.get(store)!.values()].filter(row => rowKey.parse(row).namespace === namespace).map(row => structuredClone(row)),
        put: async (store, value) => {
          if (!write)
            throw new Error('只读事务')
          const { namespace, id } = rowKey.parse(value)
          working.get(store)!.set(JSON.stringify([namespace, id]), structuredClone(value))
        },
        remove: async (store, key) => {
          if (!write)
            throw new Error('只读事务')
          working.get(store)!.delete(JSON.stringify(key))
        },
      }
      try {
        const result = await operation(tx)
        if (write)
          data = working
        return result
      }
      finally { release() }
    },
    close: () => {},
  }
}

// Keep only data already read in this page as a fallback. Never erase disk data on quota errors.
export function resilientHistoryDatabase(primary: LocalDatabase, onFailure: () => void): LocalDatabase {
  const memory = memoryHistoryDatabase()
  let persistent = true
  let tail = Promise.resolve()
  return {
    async run(write, operation) {
      const before = tail
      let release: () => void = () => {}
      tail = new Promise<void>((resolve) => {
        release = resolve
      })
      await before
      try {
        if (!persistent)
          return await memory.run(write, operation)
        const journal: Array<{ store: StoreName, value?: object, key?: Key, clearNamespace?: string }> = []
        try {
          const result = await primary.run(write, async tx => operation({
            get: async (store, key) => {
              const value = await tx.get(store, key)
              journal.push(value && typeof value === 'object' ? { store, value } : { store, key })
              return value
            },
            all: async (store, namespace) => {
              const values = await tx.all(store, namespace)
              // Replace the namespace's mirror, including deletions made by other tabs.
              journal.push({ store, clearNamespace: namespace })
              for (const value of values) {
                if (value && typeof value === 'object')
                  journal.push({ store, value })
              }
              return values
            },
            put: async (store, value) => {
              await tx.put(store, value)
              journal.push({ store, value })
            },
            remove: async (store, key) => {
              await tx.remove(store, key)
              journal.push({ store, key })
            },
          }))
          await memory.run(true, async (tx) => {
            for (const item of journal) {
              if (item.clearNamespace) {
                for (const row of await tx.all(item.store, item.clearNamespace)) {
                  const key = rowKey.parse(row)
                  await tx.remove(item.store, [key.namespace, key.id])
                }
              }
              else if (item.value) {
                await tx.put(item.store, item.value)
              }
              else if (item.key) {
                await tx.remove(item.store, item.key)
              }
            }
          })
          return result
        }
        catch (error) {
          if (error instanceof LocalHistoryConflict || error instanceof z.ZodError)
            throw error
          persistent = false
          primary.close()
          onFailure()
          return await memory.run(write, operation)
        }
      }
      finally { release() }
    },
    close: () => {
      primary.close()
      memory.close()
    },
  }
}
