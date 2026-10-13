// Worker "ayran-proxy" (Cloudflare).
// Rota: vztecnologia.com.br/ayran*  (e www.vztecnologia.com.br/ayran*)
// Repassa so o /ayran pro tunel do PC do Ayran; o resto do site continua indo pra Hostinger.
// O caminho vai inteiro (/ayran/...): a Central remove o prefixo sozinha.

const ORIGIN = 'ayran-origin.vztecnologia.com.br'

export default {
  async fetch(request) {
    const url = new URL(request.url)
    url.hostname = ORIGIN
    // redirect: 'manual' pra Central controlar os proprios redirecionamentos (ex: /ayran -> /ayran/)
    const response = await fetch(new Request(url, request), { redirect: 'manual' })

    // Redirecionamento apontando pro host interno volta pro dominio publico.
    const location = response.headers.get('location')
    if (location && location.includes(ORIGIN)) {
      const headers = new Headers(response.headers)
      headers.set('location', location.replace(ORIGIN, new URL(request.url).hostname))
      return new Response(response.body, { status: response.status, headers })
    }
    return response
  },
}
