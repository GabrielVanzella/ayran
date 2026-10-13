import { ArrowLeftRight } from 'lucide-react'
import type { MediaCapabilities } from '../lib/api'

export type SizeChoice = { type: 'quick'; id: string } | { type: 'template'; id: string } | { type: 'custom'; w: string; h: string }

const QUICK_LABELS: Record<string, string> = { quadrado: 'Quadrado', retrato: 'Retrato', paisagem: 'Paisagem' }
const QUICK_DIMS: Record<string, [number, number]> = { quadrado: [512, 512], retrato: [512, 768], paisagem: [768, 512] }
const RATIOS: [string, number, number][] = [
  ['1:1', 1080, 1080],
  ['4:5', 1080, 1350],
  ['9:16', 1080, 1920],
  ['16:9', 1920, 1080],
]

/** Desenho da proporcao (um retangulo cabendo numa caixa de 20 px). */
function Aspect({ w, h }: { w: number; h: number }) {
  const k = 18 / Math.max(w, h)
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-[3px] border border-current opacity-80"
      style={{ width: Math.max(6, Math.round(w * k)), height: Math.max(6, Math.round(h * k)) }}
    />
  )
}

export function customError(w: string, h: string, caps: MediaCapabilities | null): string {
  const min = caps?.custom.min ?? 256
  const max = caps?.custom.max ?? 2048
  const maxRatio = caps?.custom.max_ratio ?? 4
  const W = Number(w)
  const H = Number(h)
  if (!Number.isInteger(W) || !Number.isInteger(H)) return 'Use números inteiros (em pixels).'
  if (W < min || H < min || W > max || H > max) return `Cada lado precisa ficar entre ${min} e ${max} px.`
  if (Math.max(W / H, H / W) > maxRatio) return `Proporção extrema demais (máximo ${maxRatio}:1).`
  if (W * H > 4_200_000) return 'Tamanho grande demais (máximo ~4 megapixels).'
  return ''
}

/** Estimativa honesta pra este notebook (placa de 4 GB): tamanho final grande = gera pequeno e amplia. */
export function estimate(choice: SizeChoice, caps: MediaCapabilities | null): string {
  if (choice.type === 'quick') return 'cerca de 1 min'
  const t = caps?.templates.find((x) => x.id === (choice.type === 'template' ? choice.id : ''))
  const w = t ? t.width : Number(choice.type === 'custom' ? choice.w : 0)
  const h = t ? t.height : Number(choice.type === 'custom' ? choice.h : 0)
  return w > 768 || h > 768 ? 'cerca de 2 a 3 min (gera e depois amplia)' : 'cerca de 1 min'
}

type Props = { caps: MediaCapabilities | null; value: SizeChoice; onChange: (c: SizeChoice) => void }

export default function SizePicker({ caps, value, onChange }: Props) {
  const templates = caps?.templates ?? []
  const groups = [...new Set(templates.map((t) => t.group))]
  const quick = caps?.sizes ?? ['quadrado']
  const custom = value.type === 'custom' ? value : { type: 'custom' as const, w: '1080', h: '1080' }
  const err = value.type === 'custom' ? customError(value.w, value.h, caps) : ''

  const pill = (active: boolean) =>
    `flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs transition ${
      active ? 'bg-white text-void' : 'border border-line text-dim hover:border-white/40 hover:text-ink'
    }`

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-xs uppercase tracking-wider text-dim">Tamanho</legend>

      {groups.map((g) => (
        <div key={g} className="flex flex-wrap items-center gap-2">
          <span className="w-28 shrink-0 text-xs text-dim">{g}</span>
          {templates
            .filter((t) => t.group === g)
            .map((t) => (
              <button
                type="button"
                key={t.id}
                aria-pressed={value.type === 'template' && value.id === t.id}
                title={`${t.width} × ${t.height} px · ${t.hint}`}
                onClick={() => onChange({ type: 'template', id: t.id })}
                className={pill(value.type === 'template' && value.id === t.id)}
              >
                <Aspect w={t.width} h={t.height} />
                {t.label}
                <span className="opacity-60">
                  {t.width}×{t.height}
                </span>
              </button>
            ))}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 shrink-0 text-xs text-dim">Rápido</span>
        {quick.map((q) => (
          <button
            type="button"
            key={q}
            aria-pressed={value.type === 'quick' && value.id === q}
            onClick={() => onChange({ type: 'quick', id: q })}
            className={pill(value.type === 'quick' && value.id === q)}
          >
            <Aspect w={(QUICK_DIMS[q] ?? [1, 1])[0]} h={(QUICK_DIMS[q] ?? [1, 1])[1]} />
            {QUICK_LABELS[q] ?? q}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={value.type === 'custom'}
          onClick={() => onChange(custom)}
          className={pill(value.type === 'custom')}
        >
          Personalizado
        </button>
      </div>

      {value.type === 'custom' && (
        <div className="ml-0 flex flex-wrap items-center gap-2 sm:ml-[7.5rem]">
          <label className="sr-only" htmlFor="tam-largura">
            Largura em pixels
          </label>
          <input
            id="tam-largura"
            name="largura"
            inputMode="numeric"
            autoComplete="off"
            value={value.w}
            onChange={(e) => onChange({ ...value, w: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            aria-invalid={!!err}
            className="w-24 rounded-full border border-line bg-white/[0.06] px-4 py-1.5 text-center text-sm tabular-nums outline-none focus:border-white/40"
          />
          <button
            type="button"
            aria-label="Trocar largura e altura"
            onClick={() => onChange({ ...value, w: value.h, h: value.w })}
            className="rounded-full p-2 text-dim transition hover:bg-white/10 hover:text-ink"
          >
            <ArrowLeftRight className="size-4" />
          </button>
          <label className="sr-only" htmlFor="tam-altura">
            Altura em pixels
          </label>
          <input
            id="tam-altura"
            name="altura"
            inputMode="numeric"
            autoComplete="off"
            value={value.h}
            onChange={(e) => onChange({ ...value, h: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            aria-invalid={!!err}
            className="w-24 rounded-full border border-line bg-white/[0.06] px-4 py-1.5 text-center text-sm tabular-nums outline-none focus:border-white/40"
          />
          <span className="text-xs text-dim">px</span>
          {RATIOS.map(([label, w, h]) => (
            <button
              type="button"
              key={label}
              onClick={() => onChange({ type: 'custom', w: String(w), h: String(h) })}
              className="rounded-full border border-line px-3 py-1 text-xs text-dim transition hover:text-ink"
            >
              {label}
            </button>
          ))}
          {err && (
            <p role="alert" className="basis-full text-xs text-red-300">
              {err}
            </p>
          )}
        </div>
      )}
    </fieldset>
  )
}
