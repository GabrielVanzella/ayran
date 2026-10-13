import { useEffect, useState } from 'react'
import { ImageIcon, Loader2, X } from 'lucide-react'
import { AuthError, getCityInfo, setCityInfo } from '../lib/api'

type Props = { cityName: string; onSaved: () => void; onAuthError: () => void }

/** So administrador: descreve a vista da cidade (a IA nao conhece a geografia de cada lugar) e recria as imagens. */
export default function CityViewEditor({ cityName, onSaved, onAuthError }: Props) {
  const [info, setInfo] = useState<{ desc: string; custom: boolean; editable: boolean } | null>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getCityInfo()
      .then((i) => {
        if ('editable' in i) {
          setInfo(i)
          setText(i.custom ? i.desc : '')
        }
      })
      .catch((e) => e instanceof AuthError && onAuthError())
  }, [cityName, onAuthError])

  if (!info?.editable) return null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await setCityInfo(text.trim())
      setOpen(false)
      setInfo((i) => (i ? { ...i, desc: text.trim(), custom: true } : i))
      onSaved()
    } catch (err) {
      if (err instanceof AuthError) return onAuthError()
      setError(err instanceof Error ? err.message : 'Não consegui salvar')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-5 flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs text-dim transition hover:bg-white/10 hover:text-ink"
      >
        <ImageIcon className="size-4" /> {info.custom ? 'Editar a vista de' : 'Descrever a vista de'} {cityName}
      </button>
    )
  }

  return (
    <form onSubmit={save} className="mt-5 space-y-3 rounded-2xl border border-white/12 bg-white/[0.04] p-4">
      <div className="flex items-start gap-2">
        <label htmlFor="vista-cidade" className="flex-1 text-sm">
          Como é a vista de {cityName}?
          <span className="mt-1 block text-xs text-dim">
            A IA não conhece cada cidade. Diga o que aparece em fotos largas: serra, rio, mar, prédios, vegetação. Pode escrever em português.
          </span>
        </label>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-dim hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
      <textarea
        id="vista-cidade"
        name="vista"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={300}
        required
        autoComplete="off"
        placeholder="Ex.: Serra do Japi coberta de mata ao fundo, prédios e casas, céu com nuvens…"
        className="w-full resize-none rounded-2xl border border-line bg-white/[0.06] px-4 py-3 text-sm outline-none focus:border-white/40"
      />
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-dim">As imagens atuais serão recriadas (cerca de 3 min cada).</span>
        <button
          disabled={saving || text.trim().length < 3}
          className="flex shrink-0 items-center gap-2 rounded-full bg-neon px-4 py-2 text-sm font-semibold text-void transition hover:bg-neon-soft disabled:opacity-50"
        >
          {saving && <Loader2 className="size-4 animate-spin" />} Salvar e recriar
        </button>
      </div>
    </form>
  )
}
