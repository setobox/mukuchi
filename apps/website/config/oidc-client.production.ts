import { pageUrl } from '../shared/site/url.ts'

export function productionOidcClient(siteUrl: string) {
  return {
    clientId: 'mukuchi',
    name: 'mukuchi 博客',
    redirectUris: [pageUrl(siteUrl, '/', '/api/auth/sso/callback')],
    postLogoutRedirectUris: [pageUrl(siteUrl, '/', '/')],
    scopes: ['openid', 'profile', 'email'],
    skipConsent: false,
    disabled: false,
  }
}
