import { isThemePreference, themeCookieKey, themeCookieOptions } from '../../shared/theme/preference'

export default defineEventHandler((event) => {
  const value = getCookie(event, themeCookieKey)
  if (value === undefined || isThemePreference(value))
    return
  setCookie(event, themeCookieKey, 'system', themeCookieOptions)
  // Make the validated value available to the module's SSR useCookie call too.
  const cookies = (getHeader(event, 'cookie') ?? '').split(';').filter(part => part.trim().split('=')[0] !== themeCookieKey)
  event.node.req.headers.cookie = [...cookies, `${themeCookieKey}=system`].join('; ')
})
