export function pageUrl(siteUrl: string, baseURL: string, path: string): string {
  const site = new URL(siteUrl)
  if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password
    || site.pathname !== '/' || site.search || site.hash) {
    throw new Error('站点地址必须是完整的 HTTP(S) 源地址，不含路径、凭据、查询参数或锚点')
  }
  const pathname = path.split(/[?#]/, 1)[0] || '/'
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\'))
    throw new Error('页面地址必须是站内绝对路径')
  return new URL(`${baseURL.replace(/\/$/, '')}${pathname}`, site).href
}
