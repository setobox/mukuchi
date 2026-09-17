import { fileURLToPath } from 'node:url'
import { generateCoverIcons } from '../modules/cover-icons/generate.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const collections = await generateCoverIcons(root, fileURLToPath(new URL('../.data/cover-icons', import.meta.url)))
console.log(`已生成 ${collections.length} 个图标集，共 ${collections.reduce((sum, item) => sum + item.total, 0)} 个图标。`)
