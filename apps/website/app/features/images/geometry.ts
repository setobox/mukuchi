export interface Point { x: number, y: number }
export interface Size { width: number, height: number }
export interface ImageTransform extends Point { scale: number }
export const initialTransform = (): ImageTransform => ({ scale: 1, x: 0, y: 0 })

export function fitImage(image: Size, viewport: Size): Size {
  if (image.width <= 0 || image.height <= 0)
    return { width: 0, height: 0 }
  const ratio = Math.max(0, Math.min(1, viewport.width / image.width, viewport.height / image.height))
  return { width: image.width * ratio, height: image.height * ratio }
}

export function constrainTransform(value: ImageTransform, image: Size, viewport: Size): ImageTransform {
  const scale = Math.min(4, Math.max(1, value.scale))
  const limitX = Math.max(0, (image.width * scale - viewport.width) / 2)
  const limitY = Math.max(0, (image.height * scale - viewport.height) / 2)
  return { scale, x: Math.min(limitX, Math.max(-limitX, value.x)), y: Math.min(limitY, Math.max(-limitY, value.y)) }
}

// Origin is relative to the stage center. Keep the image point beneath it fixed.
export function zoomImage(value: ImageTransform, target: number, origin: Point, image: Size, viewport: Size): ImageTransform {
  const scale = Math.min(4, Math.max(1, target))
  const ratio = scale / value.scale
  return constrainTransform({ scale, x: origin.x - (origin.x - value.x) * ratio, y: origin.y - (origin.y - value.y) * ratio }, image, viewport)
}

export function pinchImage(value: ImageTransform, before: [Point, Point], after: [Point, Point], image: Size, viewport: Size): ImageTransform {
  const distance = (points: [Point, Point]) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  const center = (points: [Point, Point]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 })
  const oldDistance = distance(before)
  if (!oldDistance)
    return value
  const oldCenter = center(before)
  const newCenter = center(after)
  const scale = Math.min(4, Math.max(1, value.scale * distance(after) / oldDistance))
  const ratio = scale / value.scale
  return constrainTransform({
    scale,
    x: newCenter.x - (oldCenter.x - value.x) * ratio,
    y: newCenter.y - (oldCenter.y - value.y) * ratio,
  }, image, viewport)
}
