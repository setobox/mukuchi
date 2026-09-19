import process from 'node:process'

const target = process.env.MUKUCHI_SMOKE_URL
const revision = process.env.GITHUB_SHA
const token = process.env.NUXT_AUDIO_SYNC_TOKEN
if (!target || !revision || !token || token.length < 32)
  throw new Error('缺少音频部署同步地址、版本或认证配置')
const url = new URL(`${target.replace(/\/$/, '')}/api/internal/audio/sync`)
if (url.protocol !== 'https:' || url.username || url.password)
  throw new Error('音频同步仅允许无内嵌凭据的 HTTPS 地址')
let synced = false
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ revision }) })
    if (response.ok) {
      synced = true
      break
    }
    console.warn(`音频清单同步返回 HTTP ${response.status}`)
  }
  catch {
    console.warn('音频清单同步暂时不可用')
  }
  if (attempt < 2)
    await new Promise(resolve => setTimeout(resolve, 5000))
}
if (!synced)
  throw new Error('文章已部署，音频同步失败；请重试此工作流的音频同步任务')
console.log('音频清单已同步，生成任务将在后台执行。')
