import type { AdminDatabase, ContentFile, PlatformOptions, PrivateStorage, PublishImage } from '../database'
import { existsSync } from 'node:fs'
import { lstat, mkdir, readdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { AdminError, articleRoute, filePathSchema, sha256 } from '../../../../shared/admin/model'

export function openDatabase(options: PlatformOptions): AdminDatabase {
  if (!existsSync(options.filename))
    throw new AdminError(503, '后台数据库未初始化，请先执行迁移')
  const db = new DatabaseSync(options.filename)
  db.exec('PRAGMA busy_timeout = 5000')
  return {
    async batch(statements) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const results = statements.map(s => db.prepare(s.sql).all(...(s.params ?? [])) as Record<string, unknown>[])
        db.exec('COMMIT')
        return results
      }
      catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    close: () => db.close(),
  }
}
function inside(root: string, path: string) {
  const local = relative(root, path)
  return local !== '..' && !local.startsWith(`..\\`) && !local.startsWith('../') && !isAbsolute(local)
}
export async function safeFile(root: string, path: string) {
  const resolvedRoot = await realpath(root)
  const target = resolve(resolvedRoot, path)
  if (!inside(resolvedRoot, target))
    throw new AdminError(400, '文件路径超出允许目录')
  let cursor = target
  while (cursor !== resolvedRoot) {
    try {
      const info = await lstat(cursor)
      if (info.isSymbolicLink() || !inside(resolvedRoot, await realpath(cursor)))
        throw new AdminError(400, '不支持符号链接路径')
    }
    catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
        throw error
    }
    cursor = dirname(cursor)
  }
  return target
}
export function openStorage(options: PlatformOptions): PrivateStorage {
  const file = (id: string) => {
    if (!/^[\da-f-]{36}$/.test(id))
      throw new AdminError(400, '图片标识无效')
    return join(options.assetsDirectory, id)
  }
  return {
    async put(id, bytes) {
      await mkdir(options.assetsDirectory, { recursive: true })
      await writeFile(file(id), bytes, { flag: 'wx' })
    },
    async get(id) {
      try {
        return new Uint8Array(await readFile(file(id)))
      }
      catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
          return null
        throw error
      }
    },
    async remove(id) {
      await unlink(file(id)).catch((error: unknown) => {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT')
          throw error
      })
    },
  }
}
export async function readContent(options: PlatformOptions, path: string): Promise<ContentFile | null> {
  const filename = await safeFile(options.postsDirectory, filePathSchema.parse(path))
  try {
    const source = await readFile(filename, 'utf8')
    return { path, source, hash: await sha256(source) }
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return null
    throw error
  }
}
export async function listContent(options: PlatformOptions): Promise<ContentFile[]> {
  const paths: string[] = []
  async function walk(directory: string, prefix: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink())
        continue
      const path = `${prefix}${entry.name}`
      if (entry.isDirectory() && !entry.name.startsWith('.'))
        await walk(join(directory, entry.name), `${path}/`)
      else if (entry.isFile() && entry.name.endsWith('.md'))
        paths.push(path)
    }
  }
  await walk(options.postsDirectory, '')
  const files = await Promise.all(paths.map(path => readContent(options, path)))
  return files.filter((file): file is ContentFile => file !== null)
}
export async function publishLocal(options: PlatformOptions, input: { path: string, source: string, baseHash: string | null, remove: boolean, images: PublishImage[] }) {
  const filename = await safeFile(options.postsDirectory, filePathSchema.parse(input.path))
  const current = await readContent(options, input.path)
  const resultHash = input.remove ? null : await sha256(input.source)
  if ((current?.hash ?? null) === resultHash)
    return resultHash
  if ((current?.hash ?? null) !== input.baseHash)
    throw new AdminError(409, '本地文章已被修改，请对比最新版本后重新发布')
  if (!input.remove) {
    const route = articleRoute(input.path)
    if ((await listContent(options)).some(file => file.path !== input.path && articleRoute(file.path) === route))
      throw new AdminError(409, '文章路径规范化后与已有文章冲突')
    await mkdir(options.imagesDirectory, { recursive: true })
    for (const image of input.images) {
      if (!/^\/images\/[\da-f]{64}\.(?:png|jpg|webp|gif)$/.test(image.path))
        throw new AdminError(400, '图片路径无效')
      const destination = await safeFile(options.imagesDirectory, image.path.slice('/images/'.length))
      if (existsSync(destination)) {
        if (await sha256(new Uint8Array(await readFile(destination))) !== await sha256(image.bytes))
          throw new AdminError(409, '图片路径内容冲突')
      }
      else {
        await writeFile(destination, image.bytes, { flag: 'wx' })
      }
    }
    await mkdir(dirname(filename), { recursive: true })
    const temporary = `${filename}.${crypto.randomUUID()}.tmp`
    await writeFile(temporary, input.source, { flag: 'wx' })
    try {
      if ((await readContent(options, input.path))?.hash !== current?.hash)
        throw new AdminError(409, '本地文章已被修改')
      await rename(temporary, filename)
    }
    finally { await unlink(temporary).catch(() => {}) }
  }
  else if (current) {
    await unlink(filename)
  }
  return resultHash
}
