import assert from 'node:assert/strict'

export async function assertSmokeStatus(response: Response, expected: number, url: URL) {
  if (response.status === expected)
    return

  // Keep Cloudflare's error code/title and Ray ID: a bare 503 hides CPU limits.
  const headers = Object.fromEntries(
    ['server', 'cf-ray', 'content-type', 'retry-after', 'date']
      .map(name => [name, response.headers.get(name)])
      .filter((entry): entry is [string, string] => entry[1] !== null),
  )
  let body: string
  try {
    body = (await response.clone().text())
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500)
  }
  catch (error) {
    body = `无法读取错误响应：${error instanceof Error ? error.message : String(error)}`
  }
  assert.equal(response.status, expected, `GET ${url.href}\n${JSON.stringify({ status: response.status, expected, headers, body })}`)
}
