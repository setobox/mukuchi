import sanitizeHtml from 'sanitize-html'
import { assistantLimits } from './limits'

/** HTML is presentation data only. Links, images and active elements use trusted Vue templates. */
export function cleanAssistantHtml(html: string, css: string): { html: string, css: string } {
  if (new TextEncoder().encode(html).byteLength > assistantLimits.htmlBytes || new TextEncoder().encode(css).byteLength > assistantLimits.cssBytes)
    throw new Error('展示内容超过大小限制')
  const clean = sanitizeHtml(html, {
    allowedTags: ['div', 'section', 'article', 'header', 'footer', 'p', 'span', 'strong', 'em', 'small', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'pre', 'code', 'blockquote', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption'],
    allowedAttributes: { '*': ['class'], 'th': ['colspan', 'rowspan'], 'td': ['colspan', 'rowspan'] },
    allowedSchemes: [],
    allowProtocolRelative: false,
    parseStyleAttributes: false,
  })
  // A separate stylesheet plus CSP avoids inline handlers, HTML breakout and external resources.
  if (/[<>\\@]|url\s*\(|expression\s*\(/i.test(css))
    throw new Error('展示样式包含不支持的内容')
  if (!sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).trim())
    throw new Error('展示内容为空')
  return { html: clean, css }
}
