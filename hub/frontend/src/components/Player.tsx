/** Converte um link do Spotify em link de embed (ou null se nao for do Spotify). */
export function spotifyEmbed(url: string): string | null {
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|artist|track|episode|show)\/([A-Za-z0-9]+)/)
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` : null
}

/** Player fixo da barra inferior: fica montado o tempo todo pra musica nao parar ao trocar de tela. */
export default function Player({ url }: { url: string }) {
  const src = spotifyEmbed(url)
  if (!src) return null
  return (
    <iframe
      title="Spotify"
      src={src}
      className="h-[80px] w-full rounded-xl border-0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
    />
  )
}
