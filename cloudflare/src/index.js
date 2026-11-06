// /api/・/admin/・/static/ へのリクエストを Django（BACKEND_ORIGIN）へそのまま転送する。
// それ以外（画面）は wrangler.jsonc の assets 設定により静的配信から返るので、ここには来ない。

const BACKEND_PREFIXES = ['/api/', '/admin/', '/static/']

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (!BACKEND_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
      return env.ASSETS.fetch(request)
    }

    const backend = new URL(url.pathname + url.search, env.BACKEND_ORIGIN)
    const headers = new Headers(request.headers)
    // Django 側で元のアクセス元を判別できるようにする（CSRFの Origin 判定などに使う）。
    headers.set('X-Forwarded-Host', url.host)
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''))

    const response = await fetch(backend, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
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
