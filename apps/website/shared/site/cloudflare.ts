import { pageUrl } from './url.ts'

export function cloudflareSiteRoutes(siteUrl: string) {
  const site = new URL(pageUrl(siteUrl, '/', '/'))
  if (site.protocol !== 'https:' || site.port)
    throw new Error('Cloudflare 自定义域名必须使用不含端口的 HTTPS 站点地址')
  return [{ pattern: site.hostname, custom_domain: true }]
}
