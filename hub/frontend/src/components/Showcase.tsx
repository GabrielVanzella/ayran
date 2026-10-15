import { useState } from 'react'
import { ArrowLeft, ArrowRight, FlaskConical } from 'lucide-react'
import { AREAS, FEATURES, STATUS_LABEL, type Area, type Feature, type Status } from './demos'
import type { Tab } from '../App'

type Props = { onGo: (tab: Tab) => void; isAdmin: boolean }

const BADGE: Record<Status, string> = {
  ativo: 'bg-emerald-400/15 text-emerald-200',
  previa: 'bg-sky-400/15 text-sky-200',
  planejado: 'bg-white/10 text-dim',
}

export default function Showcase({ onGo, isAdmin }: Props) {
  const [area, setArea] = useState<Area | 'Todas'>('Todas')
  const [open, setOpen] = useState<string | null>(null)
  const feature = FEATURES.find((f) => f.id === open)

  if (feature) return <Detail f={feature} onBack={() => setOpen(null)} />

  const list = FEATURES.filter((f) => (area === 'Todas' || f.area === area) && (f.id !== 'equipe' || isAdmin))
  const count = (s: Status) => FEATURES.filter((f) => f.status === s).length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h2 className="text-2xl font-semibold">O que o Ayran faz — e o que vem por aí</h2>
        <p className="mt-1 max-w-3xl text-dim">
          {count('ativo')} recursos ativos, {count('previa')} em prévia (telas de demonstração com dados de exemplo) e {count('planejado')} planejados.
          Toque em um cartão para ver como vai funcionar.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por área">
        {(['Todas', ...AREAS] as const).map((a) => (
          <button
            key={a}
            onClick={() => setArea(a)}
            aria-pressed={area === a}
            className={`rounded-full px-4 py-1.5 text-sm transition ${area === a ? 'bg-white text-void' : 'border border-white/20 text-dim hover:text-ink'}`}
          >
            {a}
          </button>
        ))}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((f) => {
          const Icon = f.icon
          return (
            <li key={f.id}>
              <button
                onClick={() => (f.status === 'ativo' && f.tab ? onGo(f.tab) : setOpen(f.id))}
                className="glass flex h-full w-full flex-col rounded-[28px] p-5 text-left transition hover:bg-white/[0.08]"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-white/10">
                    <Icon className="size-5" />
                  </span>
                  <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] ${BADGE[f.status]}`}>{STATUS_LABEL[f.status]}</span>
                </div>
                <h3 className="font-medium">{f.title}</h3>
                <p className="mt-1 flex-1 text-sm text-dim">{f.summary}</p>
                <p className="mt-3 flex items-center gap-1 text-xs text-dim">
                  {f.status === 'ativo' ? 'Abrir' : f.status === 'previa' ? 'Ver demonstração' : 'Ver detalhes'} <ArrowRight className="size-3" />
                </p>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Detail({ f, onBack }: { f: Feature; onBack: () => void }) {
  const Icon = f.icon
  const Demo = f.Demo
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-dim transition hover:text-ink">
        <ArrowLeft className="size-4" /> Todos os recursos
      </button>
      <header className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10">
          <Icon className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-semibold">{f.title}</h2>
          <p className="mt-1 text-dim">{f.summary}</p>
        </div>
        <span className={`ml-auto rounded-full px-3 py-1 text-xs ${BADGE[f.status]}`}>{STATUS_LABEL[f.status]}</span>
      </header>

      {f.status !== 'ativo' && (
        <p role="note" className="flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-2.5 text-sm text-amber-100">
          <FlaskConical className="size-4 shrink-0" />
          {Demo ? 'Demonstração com dados de exemplo. Esta função ainda está em desenvolvimento e não lê contas reais.' : 'Recurso planejado: ainda não existe no protótipo.'}
        </p>
      )}

      {Demo ? (
        <Demo />
      ) : (
        <div className="glass rounded-[28px] p-5">
          <h3 className="mb-3 font-medium">O que vai fazer</h3>
          <ul className="space-y-2 text-sm">
            {f.details?.map((d) => (
              <li key={d} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/60" /> {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
