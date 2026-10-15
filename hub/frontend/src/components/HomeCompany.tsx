import { useEffect, useState } from 'react'
import { ArrowRight, Briefcase, FolderKanban, TrendingUp, Users } from 'lucide-react'
import { AuthError, getInsights, type Insights } from '../lib/api'
import { ExampleTag } from './ui'

function Head({ icon: Icon, title, onMore }: { icon: typeof Users; title: string; onMore: () => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Icon className="size-4 text-dim" />
      <h2 className="font-medium">{title}</h2>
      <ExampleTag text="Exemplo" />
      <button onClick={onMore} className="ml-auto flex items-center gap-1 text-xs text-dim transition hover:text-ink">
        ver tudo <ArrowRight className="size-3" />
      </button>
    </div>
  )
}

const Meter = ({ value, label }: { value: number; label: string }) => (
  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="img" aria-label={label}>
    <span className="block h-full rounded-full bg-white/75" style={{ width: `${Math.min(100, value)}%` }} />
  </span>
)

/** Indicadores da empresa: receita, propostas, chamados e entregas, mais as vendas por semana. */
export function CompanyKpis({ onMore, onAuthError }: { onMore: () => void; onAuthError: () => void }) {
  const [data, setData] = useState<Insights | null>(null)
  useEffect(() => {
    getInsights()
      .then(setData)
      .catch((e) => e instanceof AuthError && onAuthError())
  }, [onAuthError])
  const max = Math.max(1, ...(data?.weekly_sales.map((w) => w.value) ?? [1]))
  return (
    <section className="glass rounded-[28px] p-5" aria-label="Indicadores da empresa">
      <Head icon={TrendingUp} title="Indicadores da empresa" onMore={onMore} />
      {!data ? (
        <p className="py-8 text-center text-sm text-dim">Carregando…</p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-2">
            {data.kpis.map((k) => (
              <li key={k.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="truncate text-xs text-dim">{k.label}</p>
                <p className="mt-1 text-xl font-semibold">{k.value}</p>
                <p className="text-xs text-dim">{k.delta}</p>
              </li>
            ))}
          </ul>
          <p className="mb-2 mt-4 text-xs text-dim">Vendas por semana (R$ mil)</p>
          <ul className="space-y-2">
            {data.weekly_sales.map((w) => (
              <li key={w.label} className="flex items-center gap-3 text-xs">
                <span className="w-16 shrink-0 text-dim">{w.label}</span>
                <Meter value={(w.value / max) * 100} label={`${w.label}: ${w.value} mil`} />
                <span className="w-7 text-right tabular-nums">{w.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

const PROJECTS = [
  { name: 'Portal do Cliente ABC', owner: 'Douglas', progress: 72, status: 'No prazo' },
  { name: 'App de entregas', owner: 'Marcos', progress: 100, status: 'Entregue' },
  { name: 'Ayran para empresas', owner: 'Gabriel', progress: 58, status: 'No prazo' },
  { name: 'Site da VZ', owner: 'Douglas', progress: 35, status: 'Atenção' },
]

export function ProjectsCard({ onMore }: { onMore: () => void }) {
  return (
    <section className="glass rounded-[28px] p-5" aria-label="Projetos">
      <Head icon={FolderKanban} title="Projetos" onMore={onMore} />
      <ul className="space-y-3">
        {PROJECTS.map((p) => (
          <li key={p.name}>
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{p.name}</span>
              <span className={`shrink-0 text-[11px] ${p.status === 'Atenção' ? 'text-amber-200' : 'text-dim'}`}>{p.status}</span>
            </p>
            <span className="mt-1 flex items-center gap-2">
              <Meter value={p.progress} label={`${p.name}: ${p.progress}%`} />
              <span className="w-9 text-right text-xs tabular-nums text-dim">{p.progress}%</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const TEAM = [
  { name: 'Gabriel', role: 'Diretor', open: 6, done: 14 },
  { name: 'Douglas', role: 'Desenvolvimento', open: 9, done: 11 },
  { name: 'Marcos', role: 'Suporte', open: 3, done: 18 },
]

export function TeamCard({ onMore }: { onMore: () => void }) {
  return (
    <section className="glass rounded-[28px] p-5" aria-label="Equipe">
      <Head icon={Briefcase} title="Equipe esta semana" onMore={onMore} />
      <ul className="space-y-3">
        {TEAM.map((t) => (
          <li key={t.name} className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold">{t.name[0]}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">
                  {t.name} <span className="text-xs text-dim">· {t.role}</span>
                </span>
                <span className="shrink-0 text-[11px] text-dim">
                  {t.done} feitas · {t.open} abertas
                </span>
              </span>
              <span className="mt-1 flex">
                <Meter value={(t.done / (t.done + t.open)) * 100} label={`${t.name}: ${t.done} de ${t.done + t.open} tarefas concluídas`} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
