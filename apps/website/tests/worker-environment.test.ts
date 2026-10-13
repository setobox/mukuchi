import { describe, expect, it, vi } from 'vitest'
import { readWorkerEnvironment, validateWorkerEnvironment, workerSecrets, workerVariables } from '../scripts/worker-environment'

function settings() {
  return { bindings: [
    ...workerSecrets.map(name => ({ name, type: 'secret_text', text: undefined as string | undefined })),
    ...workerVariables.map(name => ({ name, type: 'plain_text', text: 'configured' as string | undefined })),
    { name: 'ADMIN_DB', type: 'd1', text: undefined },
  ] }
}

describe('worker release environment preflight', () => {
  it('accepts actual secrets alongside ordinary dashboard variables and resource bindings', () => {
    expect(() => validateWorkerEnvironment(settings())).not.toThrow()
  })

  it('also accepts ordinary configuration kept encrypted and optional runtime defaults', () => {
    const value = settings()
    value.bindings = value.bindings.filter(item => !['AUTH_SESSION_MAX_AGE', 'OIDC_SCOPES'].includes(item.name))
    value.bindings.find(item => item.name === 'APP_ORIGIN')!.type = 'secret_text'
    expect(() => validateWorkerEnvironment(value)).not.toThrow()
  })

  it.each(['OIDC_CLIENT_SECRET', 'APP_ORIGIN', 'AUTH_ADMIN_EMAILS'])('rejects missing required %s', (name) => {
    const value = settings()
    value.bindings = value.bindings.filter(item => item.name !== name)
    expect(() => validateWorkerEnvironment(value)).toThrow(name)
  })

  it('rejects secrets stored publicly, blank ordinary values, and wrong binding types', () => {
    for (const [name, type, text] of [['AI_ENCRYPTION_KEY', 'plain_text', 'sensitive'], ['APP_ORIGIN', 'plain_text', '  '], ['APP_ORIGIN', 'r2_bucket', 'bucket']]) {
      const value = settings()
      Object.assign(value.bindings.find(item => item.name === name)!, { type, text })
      expect(() => validateWorkerEnvironment(value)).toThrow(name)
    }
  })

  it('reads settings without following redirects or logging response contents', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success: true, result: settings() })))
    const value = await readWorkerEnvironment('a'.repeat(32), 'mukuchi-blog', 'deployment-token', request)
    expect(() => validateWorkerEnvironment(value)).not.toThrow()
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/workers/scripts/mukuchi-blog/settings'), expect.objectContaining({ redirect: 'error' }))
    request.mockResolvedValueOnce(new Response(JSON.stringify({ secret: 'must-not-leak' }), { status: 403 }))
    await expect(readWorkerEnvironment('a'.repeat(32), 'mukuchi-blog', 'deployment-token', request)).rejects.toThrow('HTTP 403')
    await expect(readWorkerEnvironment('../invalid', 'mukuchi-blog', 'deployment-token', request)).rejects.toThrow('有效的账户')
    expect(request).toHaveBeenCalledTimes(2)
  })
})
