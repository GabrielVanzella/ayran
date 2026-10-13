import { useState } from 'react'
import { Music2 } from 'lucide-react'
import { spotifyEmbed } from './Player'

const PRESETS = [
  { label: 'Lo-fi pra codar', url: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn' },
  { label: 'Top Hits', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' },
]

type Props = { current: string; onChange: (url: string) => void }

export default function Music({ current, onChange }: Props) {
  const [url, setUrl] = useState(current)
  const valid = !!spotifyEmbed(url)

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="glass rounded-[28px] p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-[#1db954]/15 p-2.5 text-[#1db954]">
            <Music2 className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold">Spotify</h3>
            <p className="text-sm text-dim">
              Cole o link de uma playlist, álbum, artista ou música (Spotify → Compartilhar → Copiar link).
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) onChange(url.trim())
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://open.spotify.com/playlist/…"
            className="flex-1 rounded-full border border-line bg-white/[0.06] px-4 py-2.5 outline-none focus:border-neon/50"
          />
          <button
            disabled={!valid}
            className="rounded-full bg-[#1db954] px-5 py-2.5 font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
          >
            Tocar no player
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.url}
              onClick={() => {
                setUrl(p.url)
                onChange(p.url)
              }}
              className="rounded-full border border-line px-3 py-1 text-xs text-dim hover:border-[#1db954]/60 hover:text-ink"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-dim">
        Dica: logado no Spotify neste navegador, as músicas tocam completas; sem login, só prévias de 30s. O player da
        barra inferior continua tocando enquanto você navega pela central.
      </p>
    </div>
  )
}
