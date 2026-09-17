import type { CoverImage, CoverSettings } from './model'

// All filters here are generated from validated settings, never from uploaded CSS.
export function renderBackground(s: CoverSettings, image?: CoverImage) {
  if (s.transparent)
    return { defs: '', body: '' }
  const { width, height, acrylic: a } = s
  const active = !!image && a.enabled
  // Overscan by three standard deviations so blur does not blend transparent edges.
  const inset = active ? Math.ceil(a.blur * 1.5) : 0
  const defs = active ? `<filter id="cover-acrylic" x="0" y="0" width="${width}" height="${height}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${a.blur / 2}" edgeMode="duplicate"/></filter><filter id="cover-grain" x="0" y="0" width="128" height="128" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="11" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><pattern id="cover-grain-pattern" width="128" height="128" patternUnits="userSpaceOnUse"><rect width="128" height="128" filter="url(#cover-grain)"/></pattern>` : ''
  const photo = image ? `<image href="${image.dataUrl}" x="${-inset}" y="${-inset}" width="${width + inset * 2}" height="${height + inset * 2}" preserveAspectRatio="xMidYMid slice"${active ? ' filter="url(#cover-acrylic)"' : ''}/>` : ''
  const tint = active ? `<rect width="${width}" height="${height}" fill="${a.color}" fill-opacity="${a.opacity}"/><rect width="${width}" height="${height}" fill="url(#cover-grain-pattern)" opacity="${a.noise}"/>` : ''
  return { defs: `${defs}<g id="cover-background"><rect width="${width}" height="${height}" fill="${s.background}"/>${photo}${tint}</g>`, body: '<use xlink:href="#cover-background"/>' }
}

export function renderGlass(s: CoverSettings, plate: { x: number, y: number, size: number }) {
  const g = s.glass
  if (!g.enabled)
    return { defs: '', body: '' }
  const { x, y, size } = plate
  const shape = `x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.min(g.radius, size / 2)}"`
  const defs = `<clipPath id="cover-glass-clip"><rect ${shape}/></clipPath><filter id="cover-glass-blur" x="0" y="0" width="${s.width}" height="${s.height}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${g.blur / 2}" edgeMode="duplicate"/></filter>`
  const backdrop = s.transparent ? '' : '<g clip-path="url(#cover-glass-clip)"><use xlink:href="#cover-background" filter="url(#cover-glass-blur)"/></g>'
  return { defs, body: `${backdrop}<rect ${shape} fill="${g.color}" fill-opacity="${g.opacity}"/>` }
}
