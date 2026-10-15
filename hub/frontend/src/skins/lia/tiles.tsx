import { useEffect, useState } from 'react'
import { ArrowRight, ListTodo, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { AuthError, agoIso, createTask, getInsights, getNews, listMail, timeAgo, type Insight, type Insights, type NewsItem } from '../../lib/api'
import { useProjectOverviews } from '../../lib/useProjects'
import { ExampleTag } from '../../components/ui'
import { todayISO } from '../../components/Tasks'
import type { Tab } from '../../App'

const GRADIENT = 'bg-gradient-to-r from-[#2563eb] via-[#6366f1] to-[#7c3aed]'

export function Sparkline({ values, className = '' }: { values: number[]; className?: string }) {
  const w = 120
  const h = 36
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = Math.max(1, max - min)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 8)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="spark" x1="0" x2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#6366f1" stopOpacity="0.25" />
          <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill="url(#sparkfill)" />
      <path d={d} fill="none" stroke="url(#spark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const TRENDS: number[][] = [
  [30, 34, 33, 41, 44, 52, 61, 66],
  [8, 9, 12, 11, 14, 13, 14, 14],
  [38, 36, 40, 33, 31, 29, 30, 27],
  [82, 84, 83, 86, 88, 87, 90, 91],
]

/** Faixa de indicadores no topo da Lia: numero grande, variacao e mini grafico. */
export function KpiStrip({ onMore, onAuthError }: { onMore: () => void; onAuthError: () => void }) {
  const [data, setData] = useState<Insights | null>(null)
  useEffect(() => {
    getInsights()
      .then(setData)
      .catch((e) => e instanceof AuthError && onAuthError())
  }, [onAuthError])
  return (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Indicadores da empresa">
      {(data?.kpis ?? [null, null, null, null]).map((k, i) => (
        <li key={k?.label ?? i}>
          <button onClick={onMore} className="glass block h-full w-full rounded-[28px] p-5 text-left transition hover:-translate-y-0.5">
            <p className="lia-mono flex items-center justify-between gap-2 text-dim">
              <span className="truncate">{k?.label ?? '…'}</span>
              <ExampleTag text="Exemplo" />
            </p>
            <p className="lia-gradient-text mt-2 text-3xl font-semibold tabular-nums">{k?.value ?? '—'}</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <span className="flex items-center gap-1 text-xs text-dim">
                <TrendingUp className="size-3.5" /> {k?.delta ?? ''}
              </span>
              <Sparkline values={TRENDS[i % 4]} className="h-9 w-24" />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Escudo anti-golpe: quantas ameacas o Ayran separou (dado real da caixa de entrada). */
export function ShieldTile({ onMore, onAuthError }: { onMore: () => void; onAuthError: () => void }) {
  const [counts, setCounts] = useState<{ risky: number; total: number } | null>(null)
  useEffect(() => {
    const load = () =>
      listMail()
        .then((m) => setCounts({ risky: m.filter((x) => x.verdict === 'bad').length, total: m.length }))
        .catch((e) => e instanceof AuthError && onAuthError())
    load()
    window.addEventListener('ayran:notify', load)
    return () => window.removeEventListener('ayran:notify', load)
  }, [onAuthError])
  return (
    <button onClick={onMore} className="glass relative block w-full overflow-hidden rounded-[28px] p-5 text-left transition hover:-translate-y-0.5">
      <span className="pointer-events-none absolute -right-8 -top-8 size-40 rounded-full bg-gradient-to-br from-[#38bdf8]/40 to-[#a78bfa]/40 blur-2xl" aria-hidden />
      <p className="lia-mono flex items-center gap-2 text-dim">
        <ShieldCheck className="size-4" /> Escudo anti-golpe
      </p>
      <p className="lia-gradient-text relative mt-2 text-5xl font-semibold tabular-nums">{counts?.risky ?? '–'}</p>
      <p className="relative mt-1 text-sm">ameaças separadas</p>
      <p className="relative mt-1 text-xs text-dim">{counts ? `de ${counts.total} e-mails analisados, sem abrir links nem anexos` : 'Analisando a caixa…'}</p>
    </button>
  )
}

const PROJECTS = [
  { name: 'Portal Cliente ABC', progress: 72 },
  { name: 'App de entregas', progress: 100 },
  { name: 'Ayran para empresas', progress: 58 },
  { name: 'Site da VZ', progress: 35 },
]

function Ring({ value, label }: { value: number; label: string }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 56 56" className="size-14 shrink-0 -rotate-90" role="img" aria-label={`${label}: ${value}%`}>
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgb(15 23 42 / 0.1)" strokeWidth="5" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="url(#ring)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      <defs>
        <linearGradient id="ring" x1="0" x2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function ProjectRings({ onMore, onAuthError }: { onMore: () => void; onAuthError: () => void }) {
  const real = useProjectOverviews(4, onAuthError)
  if (real && real.length > 0) {
    const max = Math.max(1, ...real.map((p) => p.commits_7d))
    return (
      <section className="glass rounded-[28px] p-5" aria-label="Projetos">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-medium">Projetos</h2>
          <button onClick={onMore} className="ml-auto flex items-center gap-1 text-xs text-dim hover:text-ink">
            ver tudo <ArrowRight className="size-3" />
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {real.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <span className="relative grid place-items-center">
                <Ring value={(p.commits_7d / max) * 100} label={`${p.name}: ${p.commits_7d} commits em 7 dias`} />
                <span className="absolute text-[11px] font-semibold tabular-nums">{p.commits_7d}</span>
              </span>
              <span className="min-w-0 text-xs leading-snug">
                {p.name}
                <span className="block text-dim">{agoIso(p.last_commit)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    )
  }
  return (
    <section className="glass rounded-[28px] p-5" aria-label="Projetos">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-medium">Projetos</h2>
        <ExampleTag text="Exemplo" />
        <button onClick={onMore} className="ml-auto flex items-center gap-1 text-xs text-dim hover:text-ink">
          ver tudo <ArrowRight className="size-3" />
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {PROJECTS.map((p) => (
          <li key={p.name} className="flex items-center gap-3">
            <span className="relative grid place-items-center">
              <Ring value={p.progress} label={p.name} />
              <span className="absolute text-[11px] font-semibold tabular-nums">{p.progress}%</span>
            </span>
            <span className="min-w-0 text-xs leading-snug">{p.name}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const TEAM = [
  { name: 'Gabriel', role: 'Diretor', load: 62 },
  { name: 'Douglas', role: 'Dev', load: 85 },
  { name: 'Marcos', role: 'Suporte', load: 40 },
]

export function TeamTile({ onMore }: { onMore: () => void }) {
  return (
    <section className="glass rounded-[28px] p-5" aria-label="Equipe">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-medium">Carga da equipe</h2>
        <ExampleTag text="Exemplo" />
        <button onClick={onMore} className="ml-auto flex items-center gap-1 text-xs text-dim hover:text-ink">
          ver tudo <ArrowRight className="size-3" />
        </button>
      </div>
      <ul className="space-y-3">
        {TEAM.map((t) => (
          <li key={t.name} className="flex items-center gap-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-[#ffffff] ${GRADIENT}`}>{t.name[0]}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between text-sm">
                <span>
                  {t.name} <span className="text-xs text-dim">· {t.role}</span>
                </span>
                <span className={`text-xs tabular-nums ${t.load > 80 ? 'text-amber-300' : 'text-dim'}`}>{t.load}%</span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${t.name}: carga de ${t.load}%`}>
                <span className={`block h-full rounded-full ${GRADIENT}`} style={{ width: `${t.load}%` }} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Pontos de atencao com acao direta (criar tarefa, pedir ao Ayran, abrir a tela). */
export function AttentionTile({ onGo, onAsk, onAuthError }: { onGo: (t: Tab) => void; onAsk: (p: string) => void; onAuthError: () => void }) {
  const [items, setItems] = useState<Insight[] | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  useEffect(() => {
    getInsights()
      .then((d) => setItems(d.items.slice(0, 4)))
      .catch((e) => e instanceof AuthError && onAuthError())
  }, [onAuthError])

  async function act(i: Insight) {
    const a = i.action
    if (!a) return
    if (a.kind === 'go') return onGo(a.tab as Tab)
    if (a.kind === 'ask') return onAsk(a.prompt)
    try {
      await createTask({ title: a.title, details: `${i.title}. ${i.body}`, due_date: todayISO() })
      setDone((s) => new Set(s).add(i.id))
    } catch (e) {
      if (e instanceof AuthError) onAuthError()
    }
  }

  return (
    <section className="glass rounded-[28px] p-5" aria-label="Pontos de atenção">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-dim" />
        <h2 className="font-medium">A Lia percebeu</h2>
        <button onClick={() => onGo('business')} className="ml-auto flex items-center gap-1 text-xs text-dim hover:text-ink">
          ver tudo <ArrowRight className="size-3" />
        </button>
      </div>
      {!items ? (
        <p className="py-6 text-center text-sm text-dim">Analisando…</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="flex gap-3">
              <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${i.tone === 'bad' ? 'bg-red-400' : i.tone === 'warn' ? 'bg-amber-300' : 'bg-sky-300'}`} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {i.title} {i.source === 'exemplo' && <ExampleTag text="Exemplo" />}
                </p>
                <p className="text-xs text-dim">{i.body}</p>
                {i.action && (
                  <button
                    onClick={() => act(i)}
                    disabled={done.has(i.id)}
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-60"
                  >
                    {i.action.kind === 'task' && <ListTodo className="size-3.5" />}
                    {done.has(i.id) ? 'Tarefa criada' : i.action.label}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function NewsTile({ onMore }: { onMore: () => void }) {
  const [news, setNews] = useState<NewsItem[]>([])
  useEffect(() => {
    getNews()
      .then((n) => setNews(n.slice(0, 4)))
      .catch(() => {})
  }, [])
  return (
    <section className="glass rounded-[28px] p-5" aria-label="Notícias">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-medium">Notícias</h2>
        <button onClick={onMore} className="ml-auto flex items-center gap-1 text-xs text-dim hover:text-ink">
          ver tudo <ArrowRight className="size-3" />
        </button>
      </div>
      {news.length === 0 && <p className="py-4 text-sm text-dim">Carregando manchetes…</p>}
      <ul className="divide-y divide-[color:var(--color-line)]">
        {news.map((n) => (
          <li key={n.link + n.title}>
            <a href={n.link} target="_blank" rel="noreferrer" className="group block py-2.5">
              <p className="text-sm leading-snug group-hover:underline">{n.title}</p>
              <p className="mt-0.5 text-xs text-dim">
                {n.source} · {timeAgo(n.published)}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
