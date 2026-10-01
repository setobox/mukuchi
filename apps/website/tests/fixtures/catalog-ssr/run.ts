/* eslint-disable antfu/no-top-level-await */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildNuxt, loadNuxt } from 'nuxt/kit'

const directory = process.argv[2]
if (!directory)
  throw new Error('Missing fixture output directory')
const nuxt = await loadNuxt({
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  dev: false,
  overrides: {
    buildDir: join(directory, '.nuxt'),
    nitro: { output: { dir: join(directory, '.output') } },
  },
})
try {
  await buildNuxt(nuxt)
}
finally {
  await nuxt.close()
}
const socket = createServer()
await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve))
const address = socket.address()
if (!address || typeof address === 'string')
  throw new Error('Could not allocate SSR fixture port')
const port = address.port
await new Promise(resolve => socket.close(resolve))
const server = spawn(process.execPath, [join(directory, '.output/server/index.mjs')], {
  env: { ...process.env, NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port) },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
try {
  let output = ''
  server.stderr.on('data', (data) => {
    output += String(data)
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`SSR server startup timed out: ${output}`)), 10_000)
      server.stdout.on('data', (data) => {
        if (String(data).includes('Listening on'))
          resolve()
      })
      server.once('exit', code => reject(new Error(`SSR server exited: ${code}: ${output}`)))
      server.once('error', reject)
    })
  }
  finally {
    clearTimeout(timer)
  }
  const results = []
  for (const scenario of ['serial', 'concurrent', 'refresh', 'retry', 'refresh-error']) {
    const responses = await Promise.all(['one', 'two'].map(async (request) => {
      const response = await fetch(`http://127.0.0.1:${port}/?scenario=${scenario}&request=${request}`, { signal: AbortSignal.timeout(5_000) })
      return { request, status: response.status, calls: Number(response.headers.get('x-catalog-queries')), html: await response.text() }
    }))
    results.push({ scenario, responses })
  }
  process.stdout.write(`CATALOG_RESULT:${JSON.stringify(results)}\n`)
}
finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit')
    server.kill()
    await exited
  }
}
