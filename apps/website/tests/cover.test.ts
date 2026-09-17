// @vitest-environment happy-dom
import { expect, test } from 'vite-plus/test'
import { rasterFormat, sanitizeSvg, validateFileSize, validateRasterSize } from '../app/features/cover/assets'
import { assertExportType, exportCover } from '../app/features/cover/export'
import { layoutCover, wrapText } from '../app/features/cover/layout'
import { coverFontFamily, coverSchema, defaultCover, initialIcon } from '../app/features/cover/model'
import { renderCover } from '../app/features/cover/svg'

const measure = (text: string, style: { size: number }) => Array.from(text).length * style.size
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`

test('不同画布比例始终保持图标居中，导出倍率不改变排版', () => {
  const settings = defaultCover('')
  for (const height of [675, 800, 900, 1200]) {
    settings.height = height
    const layout = layoutCover(settings, measure)
    expect(layout.icon.x + layout.icon.size / 2).toBe(settings.width / 2)
    expect(layout.icon.y + layout.icon.size / 2).toBe(height / 2)
    settings.scale = 3
    expect(layoutCover(settings, measure)).toEqual(layout)
  }
})
test('中文和长单词按宽度换行，保留手动空行及完整 emoji', () => {
  const style = defaultCover().text
  const result = wrapText('中文封面\n\nabcdefgh', style.size * 2, style, measure)
  expect(result.lines).toEqual(['中文', '封面', '', 'ab', 'cd', 'ef', 'gh'])
  const emoji = wrapText('👨‍👩‍👧‍👦', 10, style, () => 12)
  expect(emoji.lines).toEqual(['👨‍👩‍👧‍👦'])
  expect(emoji.overflow).toBe(true)
})
test('拒绝尺寸越界、非有限数值及超出文字空间的排版', () => {
  const s = defaultCover()
  expect(() => layoutCover({ ...s, scale: 3, width: 1400 }, measure)).toThrow('4096')
  expect(() => layoutCover({ ...s, width: Number.NaN }, measure)).toThrow('参数')
  expect(() => layoutCover({ ...s, width: 239 }, measure)).toThrow('参数')
  expect(() => layoutCover({ ...s, iconSize: 900 }, measure)).toThrow('图标')
  expect(() => layoutCover({ ...s, left: '长'.repeat(150) }, measure)).toThrow('左侧')
  expect(() => layoutCover({ ...s, left: '', right: '文字', text: { ...s.text, offsetY: 1000 } }, measure)).toThrow('右侧')
})
test('透明 SVG 不绘制底色，导出保留文本转义、阴影和准确尺寸', async () => {
  const s = defaultCover('<&"')
  s.transparent = true
  s.scale = 2
  s.iconShadow.enabled = true
  const source = renderCover(s, initialIcon, measure)
  expect(source).not.toContain('<rect')
  expect(source).toContain('width="2400" height="1350"')
  expect(source).toContain('&lt;&amp;&quot;')
  expect(source).toContain('filter="url(#cover-icon-shadow)"')
  const blob = await exportCover(source, 'svg')
  expect(blob.type).toBe('image/svg+xml')
  expect(await blob.text()).toBe(source)
  s.transparent = false
  expect(renderCover(s, initialIcon, measure)).toContain('<rect width="1200" height="675" fill="#ffffff"')
})
test('SVG 保留静态渐变和内部引用并隔离标识', () => {
  const source = sanitizeSvg(svg('<defs><linearGradient id="paint"><stop offset="0" stop-color="#fff"/></linearGradient><path id="shape" d="M0 0h20v20z"/></defs><use href="#shape" fill="url(#paint)"/>'))
  expect(source).toContain('id="cover-asset-0"')
  expect(source).toContain('xlink:href="#cover-asset-1"')
  expect(source).toContain('fill="url(#cover-asset-0)"')
})
test('SVG 拒绝脚本、事件、外链、动画、实体及循环引用', () => {
  for (const body of [
    '<script>alert(1)</script>',
    '<path onload="alert(1)"/>',
    '<foreignObject/>',
    '<image href="https://example.com/a.png"/>',
    '<use href="https://example.com/a.svg#p"/>',
    '<path fill="url(https://example.com/a.svg)"/>',
    '<animate attributeName="x"/>',
    '<style>path{fill:red}</style>',
    '<path style="fill:red"/>',
    '<use href="#missing"/>',
    '<g id="loop"><use href="#loop"/></g>',
    '<path id="a"/><path id="a"/>',
  ]) expect(() => sanitizeSvg(svg(body))).toThrow()
  expect(() => sanitizeSvg(`<!DOCTYPE svg [<!ENTITY x "x">]>${svg('')}`)).toThrow()
  expect(() => sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"/>`)).toThrow()
  expect(() => sanitizeSvg(svg(`<path d="${' '.repeat(128 * 1024)}"/>`))).toThrow('128')
})
test('两侧共享样式并朝向图标，玻璃底板参与横向偏移计算', () => {
  const settings = defaultCover('左')
  settings.right = '右'
  const base = layoutCover(settings, measure)
  expect(base.blocks.map(block => block.align)).toEqual(['end', 'start'])
  expect(base.blocks[0]!.style).toEqual(base.blocks[1]!.style)
  settings.glass.enabled = true
  const glass = layoutCover(settings, measure)
  expect(glass.plate.x + glass.plate.size / 2).toBe(settings.width / 2)
  expect(glass.plate.y + glass.plate.size / 2).toBe(settings.height / 2)
  expect(glass.blocks[0]!.x).toBe(base.blocks[0]!.x - settings.glass.padding)
  expect(glass.blocks[1]!.x).toBe(base.blocks[1]!.x + settings.glass.padding)
  settings.text.offsetX = 0
  const adjacent = layoutCover(settings, measure)
  expect(adjacent.blocks[0]!.x).toBe(adjacent.plate.x)
  expect(adjacent.blocks[1]!.x).toBe(adjacent.plate.x + adjacent.plate.size)
  settings.text.offsetX = 100
  const shifted = layoutCover(settings, measure)
  expect(shifted.blocks[0]!.x).toBe(adjacent.blocks[0]!.x - 100)
  expect(shifted.blocks[1]!.x).toBe(adjacent.blocks[1]!.x + 100)
  settings.glass.padding = 160
  settings.iconSize = 400
  expect(() => layoutCover(settings, measure)).toThrow('底板')
})

test('横向偏移重新换行，纵向偏移同向移动，越界和非有限值不能导出', () => {
  const settings = defaultCover('中文换行测试内容')
  settings.right = settings.left
  settings.text.offsetX = 0
  const base = layoutCover(settings, measure)
  settings.text.offsetX = 240
  expect(layoutCover(settings, measure).blocks[0]!.lines.length).toBeGreaterThan(base.blocks[0]!.lines.length)
  settings.text.offsetX = 0
  settings.text.offsetY = -20
  const above = layoutCover(settings, measure)
  expect(above.blocks.map(block => block.y)).toEqual(base.blocks.map(block => block.y - 20))
  settings.text.offsetY = 20
  expect(layoutCover(settings, measure).blocks.map(block => block.y)).toEqual(base.blocks.map(block => block.y + 20))
  settings.text.offsetY = 2048
  expect(() => renderCover(settings, initialIcon, measure)).toThrow('超出')
  settings.text.offsetY = 0
  for (const offset of [-1, 241, Number.NaN]) {
    settings.text.offsetX = offset
    expect(() => renderCover(settings, initialIcon, measure)).toThrow('参数')
  }
})

test('默认白色背景和深色文字，SVG 保留固定字体、字重与字号声明', () => {
  const settings = defaultCover()
  expect(settings).toMatchObject({ background: '#ffffff', transparent: false })
  expect(settings.text).toMatchObject({ size: 56, weight: '600', fill: { mode: 'solid', color: '#252423' }, lineHeight: 1.3, offsetX: 48, offsetY: 0 })
  const result = renderCover(settings, initialIcon, measure)
  expect(result).toContain('<rect width="1200" height="675" fill="#ffffff"')
  expect(result).toContain('fill="#252423"')
  expect(result).toContain(`font-family="${coverFontFamily.replaceAll('"', '&quot;')}"`)
  expect(result).toContain('font-size="56" font-weight="600"')
})

test('玻璃与亚克力使用内嵌背景和固定颗粒，透明模式保留底板而隐藏背景', () => {
  const settings = defaultCover('')
  settings.transparent = false
  settings.glass.enabled = settings.acrylic.enabled = true
  const image = { name: '背景', dataUrl: 'data:image/png;base64,eA==', width: 1200, height: 675 }
  const result = renderCover(settings, initialIcon, measure, image)
  expect(result).toContain('xlink:href="#cover-background" filter="url(#cover-glass-blur)"')
  expect(result).toContain('seed="11"')
  expect(result.match(/data:image\/png/g)).toHaveLength(1)
  expect(result).toContain('preserveAspectRatio="xMidYMid slice"')
  expect(result).toContain('x="-30" y="-30" width="1260" height="735"')
  expect(result).toBe(renderCover(settings, initialIcon, measure, image))
  settings.transparent = true
  const transparent = renderCover(settings, initialIcon, measure, image)
  expect(transparent).not.toContain('cover-background')
  expect(transparent).not.toContain('cover-acrylic')
  expect(transparent).not.toContain(image.dataUrl)
  expect(transparent).toContain('fill="#ffffff" fill-opacity="0.2"')
  settings.glass.blur = Number.NaN
  expect(() => renderCover(settings, initialIcon, measure, image)).toThrow('参数')
})

test('素材校验限制大小及文件签名，JPEG 仅作为背景接收', () => {
  expect(() => validateFileSize({ size: 5 * 1024 * 1024 })).not.toThrow()
  expect(() => validateFileSize({ size: 5 * 1024 * 1024 + 1 })).toThrow('5 MiB')
  expect(() => validateFileSize({ size: 0 })).toThrow('不能为空')
  expect(() => validateRasterSize(4096, 4096)).not.toThrow()
  expect(() => validateRasterSize(4097, 4096)).toThrow('像素')
  expect(() => validateRasterSize(0, 100)).toThrow('尺寸')
  expect(rasterFormat(new Uint8Array([0xFF, 0xD8, 0xFF]), true)).toBe('image/jpeg')
  expect(() => rasterFormat(new Uint8Array([0xFF, 0xD8, 0xFF]), false)).toThrow('图标')
  expect(() => rasterFormat(new TextEncoder().encode('<svg/>'), true)).toThrow('背景')
})
test('导出不能把浏览器回退的 PNG 冒充 WebP', () => {
  expect(() => assertExportType(new Blob(['png'], { type: 'image/png' }), 'webp')).toThrow('改用 PNG')
  expect(() => assertExportType(null, 'png')).toThrow('生成失败')
  const blob = new Blob(['webp'], { type: 'image/webp' })
  expect(assertExportType(blob, 'webp')).toBe(blob)
})
test('WebP 质量越界时明确拒绝导出', async () => {
  for (const quality of [0, 1.1, Number.NaN])
    await expect(exportCover(svg(''), 'webp', quality)).rejects.toThrow('质量')
})

test('透明模式下渐变在左右文字块独立展开并保留多行文字', () => {
  const settings = defaultCover('左边\n文字')
  settings.right = '右边\n文字'
  settings.transparent = true
  settings.text.fill.mode = 'linear'
  settings.text.fill.stops = [{ position: 100, color: '#a369ff' }, { position: 0, color: '#f5f2ef' }, { position: 50, color: '#ff0000' }]
  const document = new DOMParser().parseFromString(renderCover(settings, initialIcon, measure), 'image/svg+xml')
  const gradients = [...document.querySelectorAll('linearGradient')]
  expect(gradients).toHaveLength(2)
  expect(gradients.map(node => [...node.querySelectorAll('stop')].map(stop => stop.getAttribute('offset')))).toEqual([['0%', '50%', '100%'], ['0%', '50%', '100%']])
  expect(gradients[0]!.getAttribute('x1')).not.toBe(gradients[1]!.getAttribute('x1'))
  expect(document.querySelectorAll('tspan')).toHaveLength(4)
  settings.text.fill.mode = 'radial'
  expect(renderCover(settings, initialIcon, measure).match(/<radialGradient/g)).toHaveLength(2)
  settings.text.stroke.enabled = settings.text.glow.enabled = settings.textShadow.enabled = true
  const effects = renderCover(settings, initialIcon, measure)
  expect(effects).toContain('paint-order="stroke fill"')
  expect(effects).toContain('filter="url(#cover-text-glow)"')
  expect(effects).toContain('filter="url(#cover-text-shadow)"')
  expect(effects).toContain('filterUnits="userSpaceOnUse" x="0" y="0" width="1200" height="675"')
  const shadow = new DOMParser().parseFromString(effects, 'image/svg+xml').querySelector('#cover-text-shadow')!
  expect(shadow.getAttribute('filterUnits')).toBe('userSpaceOnUse')
  expect(shadow.getAttribute('width')).toBe('1200')
})

test('渐变与文字特效拒绝无效颜色、色标数量和数值', () => {
  for (const count of [1, 6]) {
    const settings = defaultCover()
    settings.text.fill.stops = Array.from({ length: count }, () => ({ color: '#ffffff', position: 0 }))
    expect(coverSchema.safeParse(settings).success).toBe(false)
  }
  for (const position of [-1, 101, Number.NaN]) {
    const settings = defaultCover()
    settings.text.fill.stops[0]!.position = position
    expect(() => renderCover(settings, initialIcon, measure)).toThrow('参数')
  }
  const settings = defaultCover()
  settings.text.glow.color = 'url(https://invalid)'
  expect(coverSchema.safeParse(settings).success).toBe(false)
  settings.text.glow.color = '#a369ff'
  settings.text.stroke.width = 17
  expect(coverSchema.safeParse(settings).success).toBe(false)
})

test('描边外缘参与零间距、换行和纵向越界校验', () => {
  const settings = defaultCover('字')
  settings.right = '字'
  settings.text.offsetX = 0
  const base = layoutCover(settings, measure)
  settings.text.stroke.enabled = true
  settings.text.stroke.width = 16
  const stroked = layoutCover(settings, measure)
  expect(stroked.blocks[0]!.x + 8).toBe(base.blocks[0]!.x)
  expect(stroked.blocks[1]!.x - 8).toBe(base.blocks[1]!.x)
  settings.text.offsetY = 246
  settings.text.stroke.enabled = false
  expect(() => layoutCover(settings, measure)).not.toThrow()
  settings.text.stroke.enabled = true
  expect(() => renderCover(settings, initialIcon, measure)).toThrow('超出')
})
