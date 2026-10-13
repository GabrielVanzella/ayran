import { useEffect, useState } from 'react'
import { Crosshair, Loader2, MapPin, Search, X } from 'lucide-react'
import { AuthError, searchCities, type CityResult, type Location } from '../lib/api'

type Props = { onPick: (l: Location) => void; onClose?: () => void; onAuthError: () => void }

export default function LocationPicker({ onPick, onClose, onAuthError }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CityResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const t = setTimeout(() => {
      searchCities(q)
        .then((r) => {
          setResults(r)
          setError(r.length ? '' : 'Nenhuma cidade encontrada')
        })
        .catch((e) => (e instanceof AuthError ? onAuthError() : setError('Busca indisponível agora')))
        .finally(() => setLoading(false))
    }, 350)
    return () => clearTimeout(t)
  }, [q, onAuthError])

  function locateMe() {
    if (!navigator.geolocation) return setError('Seu navegador não permite localização')
    navigator.geolocation.getCurrentPosition(
      (p) => onPick({ name: 'Minha localização', lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setError('Permissão de localização negada. Busque pelo nome da cidade.'),
      { timeout: 10_000 },
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-full glass-pill px-4 py-2.5 focus-within:border-white/40">
        <Search className="size-4 text-dim" />
        <input
          autoFocus
          name="cidade"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cidade…"
          aria-label="Buscar cidade"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
        />
        {loading && <Loader2 className="size-4 animate-spin text-dim" />}
        {onClose && (
          <button onClick={onClose} aria-label="Fechar" className="text-dim hover:text-ink">
            <X className="size-4" />
          </button>
        )}
      </div>
      <button
        onClick={locateMe}
        className="flex items-center gap-2 text-sm text-dim transition hover:text-ink"
      >
        <Crosshair className="size-4" /> Usar minha localização
      </button>
      {error && <p role="status" className="text-xs text-dim">{error}</p>}
      <ul className="space-y-1">
        {results.map((c) => (
          <li key={`${c.lat},${c.lon}`}>
            <button
              onClick={() => onPick({ name: c.name, lat: c.lat, lon: c.lon })}
              className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-white/10"
            >
              <MapPin className="size-4 shrink-0 text-dim" />
              <span className="truncate">
                {c.name}
                <span className="text-dim">{[c.region, c.country].filter(Boolean).length ? ` · ${[c.region, c.country].filter(Boolean).join(', ')}` : ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
