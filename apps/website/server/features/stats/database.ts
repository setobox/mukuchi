export type SqlValue = string | number | null
export interface Statement { sql: string, params?: SqlValue[] }
export interface StatsDatabase {
  batch: (statements: Statement[]) => Promise<Record<string, unknown>[][]>
  close: () => void
}
export interface StatsDatabaseOptions { filename: string, binding: unknown }
