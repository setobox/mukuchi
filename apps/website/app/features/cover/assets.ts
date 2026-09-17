import type { CoverIcon, CoverImage } from './model'
import { escapeXml } from './svg'

const svgNamespace = 'http://www.w3.org/2000/svg'
const elements = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'use', 'symbol', 'title', 'desc'])
const attributes = new Set('id viewBox preserveAspectRatio x y x1 y1 x2 y2 cx cy r rx ry width height d points fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity transform gradientTransform gradientUnits spreadMethod offset stop-color stop-opacity clip-path clip-rule clipPathUnits mask maskUnits maskContentUnits fx fy fr color href'.split(' '))
const iconifyElements = new Set('filter feFlood feBlend feGaussianBlur feOffset feColorMatrix feMerge feMergeNode feMorphology feComposite pattern'.split(' '))
const iconifyAttributes = new Set('color-interpolation-filters filterUnits flood-color flood-opacity result in in2 stdDeviation filter dx dy values type mode radius k1 k2 k3 k4 operator patternUnits patternContentUnits patternTransform mask-type'.split(' '))

export function sanitizeSvg(source: string, parser: DOMParser = new DOMParser(), profile: 'upload' | 'iconify' = 'upload'): string {
  const limit = profile === 'iconify' ? 256 : 128
  if (new TextEncoder().encode(source).length > limit * 1024)
    throw new Error(`SVG 图标不能超过 ${limit} KiB，请简化图形。`)
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error('SVG 不能包含文档类型或实体声明。')
  const document = parser.parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (document.querySelector('parsererror') || !root || root.localName !== 'svg' || root.namespaceURI !== svgNamespace)
    throw new Error('SVG 格式无效，请上传标准 SVG 文件。')
  const nodes = [root, ...root.querySelectorAll('*')]
  if (nodes.length > 2048)
    throw new Error('SVG 图形过于复杂，请减少节点数量。')
  const ids = new Map<string, string>()
  const references: string[] = []
  for (const node of nodes) {
    const id = node.getAttribute('id')
    if (id) {
      if (!/^[\w.-]+$/.test(id) || ids.has(id))
        throw new Error('SVG 包含无效或重复的图形标识。')
      ids.set(id, `cover-asset-${ids.size}`)
    }
  }
  function rebuild(node: Element): string {
    if (node.namespaceURI !== svgNamespace || !(elements.has(node.localName) || (profile === 'iconify' && iconifyElements.has(node.localName))))
      throw new Error(`SVG 不支持 ${node.localName} 元素，请使用静态图形。`)
    const attrs: string[] = []
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name === 'xmlns' || attribute.name === 'xmlns:xlink')
        continue
      const name = attribute.name === 'xlink:href' ? 'href' : attribute.name
      if (profile === 'iconify' && name === 'style' && /^mask-type:\s*(?:alpha|luminance);?$/.test(attribute.value)) {
        attrs.push(`mask-type="${attribute.value.split(':')[1]!.trim().replace(';', '')}"`)
        continue
      }
      if (!(attributes.has(name) || (profile === 'iconify' && iconifyAttributes.has(name))))
        throw new Error(`SVG 不支持 ${attribute.name} 属性，请移除脚本、样式或外部资源。`)
      if (node === root && ['width', 'height', 'x', 'y'].includes(name))
        continue
      let value = attribute.value
      if (name === 'id') {
        value = ids.get(value)!
      }
      else if (name === 'href') {
        if (!/^#[\w.-]+$/.test(value))
          throw new Error('SVG 只允许引用文件内的图形。')
        references.push(value.slice(1))
        value = `#${ids.get(value.slice(1))}`
      }
      else if (/url\s*\(/i.test(value)) {
        const match = /^url\(#([\w.-]+)\)$/.exec(value)
        if (!match)
          throw new Error('SVG 不能引用外部资源。')
        references.push(match[1]!)
        value = `url(#${ids.get(match[1]!)})`
      }
      else if (/[<>\\]|(?:javascript|data|https?|expression)\s*:/i.test(value)) {
        throw new Error('SVG 包含不支持的属性值。')
      }
      // SVG 1.1 engines also use the namespaced spelling for <use>.
      attrs.push(`${name === 'href' ? 'xlink:href' : name}="${escapeXml(value)}"`)
    }
    const children = Array.from(node.childNodes).map(child => child.nodeType === 1
      ? rebuild(child as Element)
      : child.nodeType === 3 && ['title', 'desc'].includes(node.localName) ? escapeXml(child.textContent ?? '') : '').join('')
    return `<${node.localName}${attrs.length ? ` ${attrs.join(' ')}` : ''}>${children}</${node.localName}>`
  }
  const rawViewBox = root.getAttribute('viewBox')
  const viewBox = rawViewBox?.trim().split(/[\s,]+/).map(Number) ?? [0, 0, Number(root.getAttribute('width')), Number(root.getAttribute('height'))]
  if (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2]! <= 0 || viewBox[3]! <= 0)
    throw new Error('SVG 需要有效的 viewBox 或宽高。')
  root.setAttribute('viewBox', viewBox.join(' '))
  const result = rebuild(root)
  if (references.some(id => !ids.has(id)))
    throw new Error('SVG 引用了不存在的图形。')
  // Disallow recursive <use> graphs (including indirect cycles).
  const byId = new Map(nodes.filter(node => node.id).map(node => [node.id, node]))
  let visits = 0
  function visit(node: Element, chain: Set<Element>) {
    if (++visits > 4096 || chain.size > 64)
      throw new Error('SVG 图形引用过于复杂，请简化图形。')
    if (chain.has(node))
      throw new Error('SVG 包含循环图形引用。')
    const next = new Set(chain).add(node)
    for (const attribute of Array.from(node.attributes)) {
      const target = ['href', 'xlink:href'].includes(attribute.name) ? attribute.value.slice(1) : /^url\(#([\w.-]+)\)$/.exec(attribute.value)?.[1]
      const referenced = target ? byId.get(target) : undefined
      if (referenced)
        visit(referenced, next)
    }
    for (const child of Array.from(node.children)) visit(child, next)
  }
  visit(root, new Set())
  return result.replace('<svg ', `<svg xmlns="${svgNamespace}" xmlns:xlink="http://www.w3.org/1999/xlink" `)
}

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = url
  await image.decode().catch(() => {
    throw new Error('无法解码图片，请检查文件是否完整。')
  })
  return image
}
export function validateFileSize(file: Pick<File, 'size'>) {
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw new Error('素材不能为空，且不能超过 5 MiB。')
}

export async function readIcon(file: File): Promise<CoverIcon> {
  validateFileSize(file)
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const svg = sanitizeSvg(await file.text())
    return { id: 'upload', name: file.name, svg, monochrome: svg.includes('currentColor') }
  }
  const image = await readRaster(file, false)
  return { id: 'upload', name: file.name, monochrome: false, svg: `<svg xmlns="${svgNamespace}" viewBox="0 0 ${image.width} ${image.height}"><image width="100%" height="100%" href="${image.dataUrl}"/></svg>` }
}

export function rasterFormat(signature: Uint8Array, allowJpeg: boolean) {
  const ascii = new TextDecoder().decode(signature)
  if (signature[0] === 137 && ascii.slice(1, 4) === 'PNG')
    return 'image/png'
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP')
    return 'image/webp'
  if (allowJpeg && signature[0] === 0xFF && signature[1] === 0xD8 && signature[2] === 0xFF)
    return 'image/jpeg'
  throw new Error(allowJpeg ? '背景图片仅支持 JPG、PNG、WebP。' : '图标仅支持 SVG、PNG、WebP。')
}

export function validateRasterSize(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > 16_777_216)
    throw new Error('素材尺寸无效或超过 1600 万像素，请先缩小图片。')
}

export async function readRaster(file: File, allowJpeg = true): Promise<CoverImage> {
  validateFileSize(file)
  const type = rasterFormat(new Uint8Array(await file.slice(0, 16).arrayBuffer()), allowJpeg)
  const url = URL.createObjectURL(file)
  try {
    const image = await loadImage(url)
    validateRasterSize(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context)
      throw new Error('浏览器不支持图片处理。')
    context.drawImage(image, 0, 0)
    const dataUrl = canvas.toDataURL(type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.95)
    canvas.width = canvas.height = 0
    return { name: file.name, dataUrl, width: image.naturalWidth, height: image.naturalHeight }
  }
  finally { URL.revokeObjectURL(url) }
}
