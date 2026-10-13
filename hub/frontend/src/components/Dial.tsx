/** Medidor circular de 270 graus, feito de marcas (como o termostato da referencia). */
type Props = { value: number; label: string; caption?: string; size?: number }

const TICKS = 54
const START = 135 // graus, sentido horario a partir de "3 horas" = 0
const SWEEP = 270

export default function Dial({ value, label, caption, size = 200 }: Props) {
  const pct = Math.max(0, Math.min(100, value))
  const active = Math.round((pct / 100) * TICKS)
  const c = size / 2
  const outer = c - 6
  const inner = outer - 12

  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(pct)}%`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {Array.from({ length: TICKS + 1 }, (_, i) => {
          const a = ((START + (SWEEP * i) / TICKS) * Math.PI) / 180
          const major = i % 9 === 0
          const r2 = major ? inner - 4 : inner
          return (
            <line
              key={i}
              x1={c + Math.cos(a) * outer}
              y1={c + Math.sin(a) * outer}
              x2={c + Math.cos(a) * r2}
              y2={c + Math.sin(a) * r2}
              stroke="white"
              strokeOpacity={i <= active && pct > 0 ? 0.95 : 0.2}
              strokeWidth={major ? 2 : 1.4}
              strokeLinecap="round"
              style={{ transition: 'stroke-opacity 0.6s ease' }}
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] text-dim">{label}</span>
        <span className="text-4xl font-light tabular-nums">
          {Math.round(pct)}
          <span className="text-xl text-dim">%</span>
        </span>
        {caption && <span className="mt-0.5 text-[11px] text-dim">{caption}</span>}
      </div>
    </div>
  )
}
