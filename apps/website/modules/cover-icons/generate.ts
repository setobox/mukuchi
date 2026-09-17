import type { IconifyJSON } from '@iconify/types'
import type { IconCollection } from '../../shared/cover/icons.ts'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { getIconData, quicklyValidateIconSet } from '@iconify/utils'

export async function generateCoverIcons(root: string, destination: string) {
  const require = createRequire(join(root, 'package.json'))
  const installed = await readdir(join(root, 'node_modules/@iconify-json')).catch(() => [] as string[])
  const collections: IconCollection[] = []
  await mkdir(destination, { recursive: true })
  for (const name of installed.sort()) {
    const raw = await readFile(require.resolve(`@iconify-json/${name}/icons.json`), 'utf8')
    const data: IconifyJSON | null = quicklyValidateIconSet(JSON.parse(raw))
    if (!data)
      throw new Error(`图标集无效：${name}`)
    const info = JSON.parse(await readFile(require.resolve(`@iconify-json/${name}/info.json`), 'utf8')) as { name: string, license: { title: string, url?: string } }
    const path = `${name}-${createHash('sha256').update(raw).digest('hex').slice(0, 12)}`
    const output = join(destination, path)
    await mkdir(output, { recursive: true })
    const names = [...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})].sort()
    const index: Record<string, number> = {}
    for (let offset = 0; offset < names.length; offset += 64) {
      const chunk: IconifyJSON = { prefix: data.prefix, icons: {} }
      for (const key of names.slice(offset, offset + 64)) {
        const icon = getIconData(data, key)
        if (!icon)
          throw new Error(`无法解析图标：${name}:${key}`)
        chunk.icons[key] = icon
        index[key] = offset / 64
      }
      await writeFile(join(output, `${offset / 64}.json`), JSON.stringify(chunk))
    }
    await writeFile(join(output, 'index.json'), JSON.stringify(index))
    collections.push({ prefix: name, name: info.name, total: names.length, path, license: { name: info.license.title, url: info.license.url } })
  }
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(collections))
  return collections
}
