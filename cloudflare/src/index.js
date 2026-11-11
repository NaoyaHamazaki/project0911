// /api/・/admin/・/static/ へのリクエストを Django（BACKEND_ORIGIN）へそのまま転送する。
// それ以外（画面）は wrangler.jsonc の assets 設定により静的配信から返るので、ここには来ない。
//
// AI（Gemini/Places）を呼ぶAPIは利用料と Railway の処理枠を消費するため、ここで回数制限をかける。

const BACKEND_PREFIXES = ['/api/', '/admin/', '/static/']

// 回数制限の対象。端末ごと（厳しめ）と、IPごと（ゆるめ）の2段階で判定する。
// IPだけだと、スマホ回線などで同じIPを共有する別の人まで巻き込むため、IP側は上限を高めにしている。
// 上限値そのものは wrangler.jsonc の ratelimits で設定する。
const LIMITED_ROUTES = [
  { method: 'POST', path: '/api/spots/suggest/', device: 'SPOT_DEVICE_LIMITER', ip: 'SPOT_IP_LIMITER', label: 'AIのおすすめ候補' },
  { method: 'POST', path: '/api/trips/validate/', device: 'CHECK_DEVICE_LIMITER', ip: 'CHECK_IP_LIMITER', label: '入力内容の確認' },
  { method: 'POST', path: '/api/destinations/suggest/', device: 'DEST_DEVICE_LIMITER', ip: 'DEST_IP_LIMITER', label: '行先の候補' },
  { method: 'POST', path: '/api/lodgings/suggest/', device: 'HOTEL_DEVICE_LIMITER', ip: 'HOTEL_IP_LIMITER', label: '宿の候補' },
]

async function checkRateLimit(request, env, url) {
  const route = LIMITED_ROUTES.find((item) => item.method === request.method && item.path === url.pathname)
  if (!route) return null

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const device = (request.headers.get('X-Device-Key') || '').slice(0, 64)
  const checks = [env[route.ip]?.limit({ key: `${route.path}:ip:${ip}` })]
  // 端末キーが無い（古い画面など）場合は、IPを端末の代わりにして厳しめの上限で判定する。
  checks.push(env[route.device]?.limit({ key: `${route.path}:device:${device || ip}` }))

  const results = await Promise.all(checks.filter(Boolean))
  if (results.every((result) => result.success)) return null

  return new Response(
    JSON.stringify({ detail: `${route.label}の利用回数が多すぎます。1分ほど待ってから、もう一度お試しください。` }),
    { status: 429, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' } },
  )
}

// Railway の Serverless でスリープ中の Django は、起きるまでの最初のリクエストに 502/503 を返すことがある。
// その場合は Django にまだ届いていないので、少し待って再送する（利用者にはエラーを見せない）。
// 504（タイムアウト）は Django が処理中だった可能性があるため再送しない。
const WAKE_RETRY_STATUSES = [502, 503]
const WAKE_RETRY_DELAYS_MS = [1500, 3000]

async function fetchWithWakeRetry(url, init) {
  for (let attempt = 0; ; attempt++) {
    const isLast = attempt >= WAKE_RETRY_DELAYS_MS.length
    try {
      const response = await fetch(url, init)
      if (isLast || !WAKE_RETRY_STATUSES.includes(response.status)) return response
    } catch (error) {
      if (isLast) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_DELAYS_MS[attempt]))
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (!BACKEND_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
      return env.ASSETS.fetch(request)
    }

    const limited = await checkRateLimit(request, env, url)
    if (limited) return limited

    const backend = new URL(url.pathname + url.search, env.BACKEND_ORIGIN)
    const headers = new Headers(request.headers)
    // Django 側で元のアクセス元を判別できるようにする（CSRFの Origin 判定などに使う）。
    headers.set('X-Forwarded-Host', url.host)
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''))

    // 再送できるように、本文は先に読み込んでおく（APIの本文は小さいJSONなので問題ない）。
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer()
    const response = await fetchWithWakeRetry(backend, {
      method: request.method,
      headers,
      body,
      // 管理画面のログイン後リダイレクトなどは、ブラウザにそのまま返す。
      redirect: 'manual',
    })

    // Django が絶対URLでリダイレクトした場合も、利用者のドメインのままにする。
    const location = response.headers.get('Location')
    if (location && location.startsWith(env.BACKEND_ORIGIN)) {
      const rewritten = new Response(response.body, response)
      rewritten.headers.set('Location', location.replace(env.BACKEND_ORIGIN, url.origin))
      return rewritten
    }
    return response
  },
}
