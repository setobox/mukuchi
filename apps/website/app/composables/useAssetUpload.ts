import type { Asset } from '#shared/admin/model'
import { assetSchema, imageLimit } from '#shared/admin/model'

// Shared by the article editor and future cover tools. Accepts generated Blobs too.
export function useAssetUpload() {
  const { current, endpoint, request } = useAdminSession()
  const progress = ref(0)
  const uploading = ref(false)
  let active: XMLHttpRequest | null = null
  async function upload(draftId: string, file: File | Blob): Promise<Asset> {
    if (uploading.value)
      throw new Error('请等待当前上传完成')
    if (!file.size || file.size > imageLimit)
      throw new Error('图片不能为空，且不能超过 5 MiB')
    uploading.value = true
    progress.value = 0
    try {
      return await new Promise<Asset>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        active = xhr
        xhr.open('POST', endpoint(`/api/admin/assets?draftId=${encodeURIComponent(draftId)}`))
        xhr.setRequestHeader('x-csrf-token', current.value.csrf ?? '')
        xhr.setRequestHeader('content-type', 'application/octet-stream')
        xhr.timeout = 60000
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable)
            progress.value = Math.round(event.loaded / event.total * 100)
        }
        xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new Error('图片上传失败，请重试'))
        xhr.onload = () => {
          try {
            const data: unknown = JSON.parse(xhr.responseText)
            if (xhr.status < 200 || xhr.status >= 300)
              throw new Error(data && typeof data === 'object' && 'message' in data ? String(data.message) : '图片上传失败')
            resolve(assetSchema.parse(data))
          }
          catch (error) { reject(error) }
        }
        xhr.send(file)
      })
    }
    finally {
      uploading.value = false
      active = null
    }
  }
  onScopeDispose(() => active?.abort())
  const previewUrl = (asset: Pick<Asset, 'id'>) => endpoint(`/api/admin/assets/${asset.id}`)
  const remove = (asset: Pick<Asset, 'id'>) => request(`assets/${asset.id}`, { method: 'DELETE' })
  return { upload, progress, uploading, previewUrl, remove }
}
