export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = Exclude<ThemePreference, 'system'>

export const themeCookieKey = 'mukuchi:theme'
export const themeCookieOptions = { maxAge: 31536000, path: '/', sameSite: 'lax' as const }

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function normalizePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : 'system'
}

export function nextPreference(value: ThemePreference): ThemePreference {
  return value === 'system' ? 'light' : value === 'light' ? 'dark' : 'system'
}

export function resolveTheme(preference: ThemePreference, system: ResolvedTheme | null): ResolvedTheme {
  return preference === 'system' ? system ?? 'dark' : preference
}

// Runs before the Color Mode bootstrap, including on prerendered HTML.
// Keep this function self-contained because it is serialized into the document head.
export function normalizeThemeCookie(doc: { cookie: string }, key: string): void {
  try {
    const value = doc.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${key}=`))?.slice(key.length + 1)
    if (value !== undefined && !['system', 'light', 'dark'].includes(value))
      doc.cookie = `${key}=system; Max-Age=31536000; Path=/; SameSite=Lax`
  }
  catch {
    // A blocked cookie store must not prevent rendering or in-memory switching.
  }
}

export const themeCookieBootstrap = `(${normalizeThemeCookie.toString()})(document,${JSON.stringify(themeCookieKey)});`
