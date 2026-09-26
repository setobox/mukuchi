export const alertThemes = ['github', 'obsidian', 'vitepress', 'docusaurus'] as const
export type AlertTheme = typeof alertThemes[number]

export function alertTheme(value: unknown): AlertTheme | undefined {
  if (typeof value !== 'string')
    return undefined
  const normalized = value.trim().toLowerCase()
  return alertThemes.find(theme => theme === normalized)
}

export function mdcBoolean(value: unknown): boolean {
  return value === true || value === '' || value === 'true'
}
