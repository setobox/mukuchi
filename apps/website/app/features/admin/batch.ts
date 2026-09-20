export interface BatchItem { path: string, title: string, status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled', message: string }

export async function runSummaryBatch(items: BatchItem[], perform: (item: BatchItem) => Promise<void>, stopped: () => boolean, errorMessage: (error: unknown) => string) {
  let cursor = 0
  async function worker() {
    while (cursor < items.length && !stopped()) {
      const item = items[cursor++]!
      item.status = 'running'
      try {
        await perform(item)
        item.status = 'succeeded'
      }
      catch (error) {
        item.status = 'failed'
        item.message = errorMessage(error)
      }
    }
  }
  await Promise.all([worker(), worker()])
  for (const item of items) {
    if (item.status === 'pending')
      item.status = 'cancelled'
  }
}
