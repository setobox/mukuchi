export function localRequestAllowed(dev: boolean, peer: string | undefined, host: string, forwarded: boolean) {
  if (!dev || forwarded || !peer || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer))
    return false
  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
}
