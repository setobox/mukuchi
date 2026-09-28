import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID, webcrypto } from 'node:crypto'
import { request as httpsRequest } from 'node:https'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const website = fileURLToPath(new URL('../..', import.meta.url))
const args = new Set(process.argv.slice(2))
const valueAfter = flag => process.argv[process.argv.indexOf(flag) + 1]
const queryId = args.has('--query') ? valueAfter('--query') : undefined
const submit = args.has('--submit')
const podcast = args.has('--podcast-handshake')

if (args.has('--help') || (!queryId && !submit && !podcast)) {
  console.log('Usage: node scripts/audio-connectivity/index.js --from-remote [--query TASK_ID] [--podcast-handshake] [--submit]')
  console.log('--from-remote reads saved settings from D1. Set VOLC_API_KEY locally or use a matching NUXT_AI_ENCRYPTION_KEY in .env. --submit creates a paid two-character TTS task.')
  process.exit(args.has('--help') ? 0 : 1)
}

function remoteSettings() {
  const wrangler = fileURLToPath(new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url))
  const output = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'mukuchi-admin', '--remote', '--json', '--command', 'SELECT config, encrypted_key FROM audio_settings WHERE id = 1'], { cwd: website, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const row = JSON.parse(output)[0]?.results?.[0]
  if (!row?.config || !row?.encrypted_key)
    throw new Error('Remote audio settings or encrypted key are missing')
  return row
}

async function decrypt(value, secret) {
  const [version, iv, data] = value.split('.')
  if (version !== 'v1' || !iv || !data || !secret)
    throw new Error('Encrypted key or NUXT_AI_ENCRYPTION_KEY is missing')
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(secret, 'base64'), 'AES-GCM', false, ['decrypt'])
  try {
    return new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(iv, 'base64') }, key, Buffer.from(data, 'base64')))
  }
  catch {
    throw new Error('Local NUXT_AI_ENCRYPTION_KEY does not match the key used for remote audio settings; use VOLC_API_KEY or update the local .env')
  }
}

let settings
let apiKey
if (args.has('--from-remote')) {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))
  const row = remoteSettings()
  settings = JSON.parse(row.config)
  apiKey = process.env.VOLC_API_KEY || await decrypt(row.encrypted_key, process.env.NUXT_AI_ENCRYPTION_KEY)
}
else {
  settings = {
    authMode: process.env.VOLC_AUTH_MODE ?? 'apiKey',
    appId: process.env.VOLC_APP_ID ?? '',
    narrationResource: process.env.VOLC_NARRATION_RESOURCE ?? 'seed-tts-2.0',
    narrationSpeaker: process.env.VOLC_NARRATION_SPEAKER ?? '',
    podcastResource: process.env.VOLC_PODCAST_RESOURCE ?? 'volc.service_type.10050',
  }
  apiKey = process.env.VOLC_API_KEY
}
if (!apiKey)
  throw new Error('Set VOLC_API_KEY or use --from-remote with a matching local NUXT_AI_ENCRYPTION_KEY')
if (submit && !settings.narrationSpeaker)
  throw new Error('Set VOLC_NARRATION_SPEAKER or use --from-remote before submitting a test task')

function safeMessage(value) {
  return String(value ?? '').replaceAll(apiKey, '[redacted]').slice(0, 500)
}

function headers(resource, id) {
  return {
    ...(settings.authMode === 'legacy'
      ? { 'X-Api-App-Id': settings.appId, 'X-Api-Access-Key': apiKey }
      : { 'X-Api-Key': apiKey }),
    'X-Api-Resource-Id': resource,
    'X-Api-Request-Id': id,
  }
}

async function tts(action, body, id) {
  const response = await fetch(`https://openspeech.bytedance.com/api/v3/tts/${action}`, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    headers: { ...headers(settings.narrationResource, id), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const raw = await response.text()
  let payload
  try {
    payload = JSON.parse(raw)
  }
  catch {
    payload = { message: raw.slice(0, 300) }
  }
  console.log(JSON.stringify({ action, httpStatus: response.status, code: payload.code, message: safeMessage(payload.message), taskId: payload.data?.task_id, taskStatus: payload.data?.task_status }, null, 2))
  if (!response.ok || payload.code !== 20000000)
    process.exitCode = 1
  return payload
}

function podcastHandshake() {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const request = httpsRequest('https://openspeech.bytedance.com/api/v3/sami/podcasttts', {
      method: 'GET',
      timeout: 30_000,
      headers: {
        ...headers(settings.podcastResource, id),
        'X-Api-App-Key': 'aGjiRDfUWi',
        'X-Api-Connect-Id': randomUUID(),
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      },
    })
    request.on('upgrade', (response, socket) => {
      console.log(JSON.stringify({ action: 'podcast-handshake', httpStatus: response.statusCode, upgraded: true }, null, 2))
      socket.destroy()
      resolve()
    })
    request.on('response', (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body = (body + chunk).slice(0, 1000)
      })
      response.on('end', () => {
        console.log(JSON.stringify({ action: 'podcast-handshake', httpStatus: response.statusCode, upgraded: false, body: safeMessage(body) }, null, 2))
        process.exitCode = 1
        resolve()
      })
    })
    request.on('timeout', () => request.destroy(new Error('Podcast handshake timed out')))
    request.on('error', reject)
    request.end()
  })
}

if (queryId)
  await tts('query', { task_id: queryId }, queryId)
if (podcast)
  await podcastHandshake()
if (submit) {
  const id = randomUUID()
  await tts('submit', { user: { uid: 'mukuchi-connectivity' }, unique_id: id, req_params: {
    text: '测试',
    speaker: settings.narrationSpeaker,
    audio_params: { format: 'mp3', sample_rate: 24000 },
    additions: JSON.stringify({ aigc_watermark: true }),
  } }, id)
}
