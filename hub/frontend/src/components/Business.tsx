import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, ListTodo, Sparkles } from 'lucide-react'
import { AuthError, createTask, getInsights, type Insight, type Insights } from '../lib/api'
import { ErrorLine, ExampleTag, Loading, PageHeader } from './ui'
import { todayISO } from './Tasks'
import type { Tab } from '../App'

type Props = { onAuthError: () => void; onAsk: (prompt: string) => void; onGo: (tab: Tab) => void }

const TONE = {
  bad: { chip: 'bg-red-500/15 text-red-300', text: 'Urgente' },
  warn: { chip: 'bg-amber-400/15 text-amber-200', text: 'Atenção' },
  info: { chip: 'bg-white/10 text-ink', text: 'Insight' },
} as const

export default function Business({ onAuthError, onAsk, onGo }: Props) {
  const [data, setData] = useState<Insights | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState<Set<string>>(new Set())

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) return onAuthError()
      setError(e instanceof Error ? e.message : 'Algo deu errado')
    },
    [onAuthError],
  )
  const load = useCallback(() => {
    setError('')
    getInsights().then(setData).catch(fail)
  }, [fail])
  useEffect(load, [load])

  async function act(i: Insight) {
    const a = i.action
    if (!a) return
    if (a.kind === 'go') return onGo(a.tab as Tab)
    if (a.kind === 'ask') return onAsk(a.prompt)
    try {
      await createTask({ title: a.title, details: `${i.title}. ${i.body}`, due_date: todayISO() })
      setDone((s) => new Set(s).add(i.id))
      setNote(`Tarefa criada: ${a.title}`)
    } catch (e) {
      fail(e)
    }
  }

  const max = Math.max(1, ...(data?.weekly_sales.map((w) => w.value) ?? [1]))

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Negócio"
        subtitle="O Ayran cruza os dados da plataforma e dos sistemas da empresa e aponta o que merece atenção. Cada aviso diz de onde veio."
      />
      {note && (
        <p role="status" aria-live="polite" className="glass flex items-center gap-3 rounded-full px-5 py-2.5 text-sm">
          <Check className="size-4 shrink-0" /> {note}
          <button onClick={() => onGo('tasks')} className="ml-auto text-xs underline underline-offset-4 hover:text-white">
            Ver tarefas
          </button>
        </p>
      )}
      {error && <ErrorLine message={error} onRetry={load} />}
      {!data ? (
        <Loading text="Analisando os dados…" />
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores">
            {data.kpis.map((k) => (
              <li key={k.label} className="glass rounded-[28px] p-5">
                <p className="flex items-center justify-between gap-2 text-sm text-dim">
                  {k.label} <ExampleTag text="Exemplo" />
                </p>
                <p className="mt-2 text-3xl font-semibold">{k.value}</p>
                <p className="mt-1 text-sm text-dim">{k.delta}</p>
              </li>
            ))}
          </ul>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="glass rounded-[28px] p-5 lg:col-span-2" aria-label="Pontos de atenção">
              <h3 className="mb-3 font-medium">Pontos de atenção</h3>
              <ul className="space-y-4">
                {data.items.map((i) => (
                  <li key={i.id} className="flex gap-3">
                    <span className={`mt-0.5 h-fit shrink-0 rounded-full px-2.5 py-0.5 text-[11px] ${TONE[i.tone].chip}`}>{TONE[i.tone].text}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {i.title}
                        {i.source === 'exemplo' ? <ExampleTag text="Exemplo" /> : <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-200">Dados reais</span>}
                      </p>
                      <p className="mt-0.5 text-sm text-dim">{i.body}</p>
                      {i.action && (
                        <button
                          onClick={() => act(i)}
                          disabled={done.has(i.id)}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-60"
                        >
                          {done.has(i.id) ? <Check className="size-3.5" /> : i.action.kind === 'task' ? <ListTodo className="size-3.5" /> : i.action.kind === 'ask' ? <Sparkles className="size-3.5" /> : <ArrowRight className="size-3.5" />}
                          {done.has(i.id) ? 'Tarefa criada' : i.action.label}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="glass rounded-[28px] p-5" aria-label="Vendas por semana">
              <h3 className="mb-1 flex items-center justify-between font-medium">
                Vendas por semana <ExampleTag text="Exemplo" />
              </h3>
              <p className="mb-4 text-xs text-dim">R$ mil, mês atual</p>
              <ul className="space-y-3">
                {data.weekly_sales.map((w) => (
                  <li key={w.label} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs text-dim">{w.label}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${w.label}: ${w.value} mil`}>
                      <div className="h-full rounded-full bg-white/75" style={{ width: `${(w.value / max) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right text-xs tabular-nums">{w.value}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-dim">Mais da metade das vendas acontece na última semana. Pergunte ao Ayran como distribuir melhor.</p>
              <button
                onClick={() => onAsk('Minhas vendas por semana do mês são 38, 44, 41 e 72 (R$ mil). Analise o padrão e sugira ações para equilibrar o caixa.')}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
              >
                <Sparkles className="size-3.5" /> Pedir análise
              </button>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
