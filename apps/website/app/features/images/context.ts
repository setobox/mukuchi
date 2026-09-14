import type { InjectionKey } from 'vue'
import { readonly, shallowRef } from 'vue'

export interface PreviewImage { src: string, alt: string, caption?: string }

export function createImagePreview() {
  const image = shallowRef<PreviewImage | null>(null)
  return {
    image: readonly(image),
    open: (value: PreviewImage) => { image.value = value },
    close: () => { image.value = null },
  }
}
export const imagePreviewKey: InjectionKey<ReturnType<typeof createImagePreview>> = Symbol('image-preview')
export const imageLinkKey: InjectionKey<boolean> = Symbol('image-link')

export function canPreviewImage(preview: unknown, linked: boolean, failed: boolean): boolean {
  return preview !== false && preview !== 'false' && !linked && !failed
}

export function imageSource(src: string, base: string): string {
  if (!src.startsWith('/') || src.startsWith('//'))
    return src
  const prefix = `/${base.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/')
  return prefix === '/' || src.startsWith(prefix) ? src : `${prefix}${src.slice(1)}`
}
