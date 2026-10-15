import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, ListTodo, MailPlus, ScanSearch, Sparkles, Trash2 } from 'lucide-react'
import {
  AuthError,
  analyzeEmail,
  createTask,
  deleteMail,
  listMail,
  markMailRead,
  simulateMail,
  timeAgo,
  type Mail as MailT,
  type ScamAnalysis,
} from '../lib/api'
import { Empty, ErrorLine, ExampleTag, Loading, PageHeader, VerdictChip, verdictColor } from './ui'
import { todayISO } from './Tasks'

type Props = { onAuthError: () => void; onAsk: (prompt: string) => void; onGo: (tab: 'tasks') => void; focusId?: string | null }
type Filter = 'todos' | 'naolidos' | 'suspeitos'

export default function Mail({ onAuthError, onAsk, onGo, focusId }: Props) {
  const [mails, setMails] = useState<MailT[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [selected, setSelected] = useState<string | null>(focusId ?? null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [checker, setChecker] = useState(false)

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) return onAuthError()
      setError(e instanceof Error ? e.message : 'Algo deu errado')
    },
    [onAuthError],
  )

  const load = useCallback(() => {
    setError('')
    listMail().then(setMails).catch(fail)
  }, [fail])
  useEffect(load, [load])

  const list = useMemo(() => {
    const all = mails ?? []
    return all.filter((m) => (filter === 'todos' ? true : filter === 'naolidos' ? !m.read : m.verdict !== 'ok'))
  }, [mails, filter])
  const current = mails?.find((m) => m.id === selected) ?? null
  const counts = {
    unread: (mails ?? []).filter((m) => !m.read).length,
    risky: (mails ?? []).filter((m) => m.verdict !== 'ok').length,
  }

  async function open(m: MailT) {
    setSelected(m.id)
    setNote('')
    if (!m.read) {
      setMails((l) => (l ?? []).map((x) => (x.id === m.id ? { ...x, read: true } : x)))
      markMailRead(m.id).catch(() => {})
    }
  }

  async function arrive() {
    setBusy(true)
    try {
      const m = await simulateMail()
      setMails((l) => [m, ...(l ?? [])])
      setNote(`Chegou um e-mail de ${m.from_name}: ${m.verdict === 'bad' ? 'o Ayran identificou como provável golpe.' : 'parece seguro.'}`)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  async function remove(m: MailT) {
    if (!confirm(`Apagar o e-mail "${m.subject}"?`)) return
    try {
      await deleteMail(m.id)
      setMails((l) => (l ?? []).filter((x) => x.id !== m.id))
      setSelected(null)
      setNote('E-mail apagado.')
    } catch (e) {
      fail(e)
    }
  }

  async function toTask(m: MailT) {
    try {
      await createTask({
        title: m.verdict === 'ok' ? `Responder: ${m.subject}`.slice(0, 160) : `Verificar com cuidado: ${m.subject}`.slice(0, 160),
        details: `E-mail de ${m.from_name} <${m.from_addr}>`,
        due_date: todayISO(),
      })
      setNote('Tarefa criada para hoje.')
    } catch (e) {
      fail(e)
    }
  }

  const draft = (m: MailT) =>
    onAsk(
      `Escreva um rascunho curto e cordial de resposta ao e-mail abaixo, em nome do Gabriel (VZ Tecnologia). Não invente fatos; deixe entre colchetes o que eu precisar confirmar.\n\nDe: ${m.from_name}\nAssunto: ${m.subject}\n\n${m.body}`,
    )

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="E-mail"
        tag={<ExampleTag text="Caixa de exemplo" />}
        subtitle="O Ayran lê cada mensagem, separa o que é seguro do que parece golpe e explica o motivo. Nunca abre links nem anexos."
      >
        <button
          onClick={arrive}
          disabled={busy}
          className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm transition hover:bg-white/10 disabled:opacity-50"
        >
          <MailPlus className="size-4" /> Simular novo e-mail
        </button>
        <button
          onClick={() => setChecker((v) => !v)}
          aria-pressed={checker}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${checker ? 'bg-white text-void' : 'border border-white/20 hover:bg-white/10'}`}
        >
          <ScanSearch className="size-4" /> Analisar um e-mail
        </button>
      </PageHeader>

      {note && (
        <p role="status" aria-live="polite" className="glass flex items-center gap-3 rounded-full px-5 py-2.5 text-sm">
          <Check className="size-4 shrink-0" /> {note}
          {note.includes('tarefa') && (
            <button onClick={() => onGo('tasks')} className="ml-auto text-xs underline underline-offset-4 hover:text-white">
              Ver tarefas
            </button>
          )}
        </p>
      )}
      {error && <ErrorLine message={error} onRetry={load} />}
      {checker && <Checker onAuthError={onAuthError} />}

      {mails === null ? (
        <Loading text="Abrindo a caixa de entrada…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <section className={`glass rounded-[28px] p-3 lg:col-span-2 ${current ? 'hidden lg:block' : ''}`} aria-label="Caixa de entrada">
            <div className="mb-2 flex flex-wrap gap-2 px-1" role="group" aria-label="Filtrar e-mails">
              {(
                [
                  ['todos', `Todos (${mails.length})`],
                  ['naolidos', `Não lidos (${counts.unread})`],
                  ['suspeitos', `Suspeitos (${counts.risky})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  aria-pressed={filter === id}
                  className={`rounded-full px-3 py-1 text-xs transition ${filter === id ? 'bg-white text-void' : 'border border-white/20 text-dim hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {list.length === 0 ? (
              <Empty title="Nenhum e-mail aqui" hint="Troque o filtro ou simule a chegada de um novo e-mail." />
            ) : (
              <ul>
                {list.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => open(m)}
                      aria-current={selected === m.id}
                      className={`w-full rounded-2xl px-3 py-3 text-left transition ${selected === m.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    >
                      <div className="flex items-center gap-2">
                        {!m.read && <span className="size-2 shrink-0 rounded-full bg-sky-300" aria-label="não lido" />}
                        <span className={`min-w-0 flex-1 truncate text-sm ${m.read ? '' : 'font-semibold'}`}>{m.from_name}</span>
                        <span className="shrink-0 text-xs text-dim">{timeAgo(m.received_at)}</span>
                      </div>
                      <p className={`mt-0.5 truncate text-sm ${m.read ? 'text-dim' : ''}`}>{m.subject}</p>
                      {m.verdict !== 'ok' && (
                        <div className="mt-1.5">
                          <VerdictChip verdict={m.verdict} label={m.analysis?.label} />
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`lg:col-span-3 ${current ? '' : 'hidden lg:block'}`} aria-label="Mensagem">
            {current ? (
              <Reader m={current} onBack={() => setSelected(null)} onTask={() => toTask(current)} onDraft={() => draft(current)} onDelete={() => remove(current)} />
            ) : (
              <div className="glass rounded-[28px] p-5">
                <Empty title="Selecione um e-mail" hint="O Ayran mostra aqui o veredito de segurança e os motivos." />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function Reader({ m, onBack, onTask, onDraft, onDelete }: { m: MailT; onBack: () => void; onTask: () => void; onDraft: () => void; onDelete: () => void }) {
  const a = m.analysis
  const border = m.verdict === 'bad' ? 'border-red-400/40' : m.verdict === 'warn' ? 'border-amber-300/40' : 'border-emerald-300/30'
  return (
    <article className="glass rounded-[28px] p-5">
      <button onClick={onBack} className="mb-3 flex items-center gap-2 text-sm text-dim hover:text-ink lg:hidden">
        <ArrowLeft className="size-4" /> Voltar à caixa
      </button>
      <h3 className="text-lg font-semibold leading-snug">{m.subject}</h3>
      <p className="mt-1 text-sm text-dim">
        {m.from_name} &lt;{m.from_addr}&gt; · {new Date(m.received_at * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
      </p>

      {a && (
        <div className={`mt-4 rounded-2xl border ${border} bg-white/[0.04] p-4`} role="region" aria-label="Análise de segurança">
          <div className="flex flex-wrap items-center gap-3">
            <VerdictChip verdict={a.verdict} label={a.label} />
            <span className={`text-xs ${verdictColor(a.verdict)}`}>Risco {a.score} de 100</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {a.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/60" /> {r}
              </li>
            ))}
            {a.positives.map((r) => (
              <li key={r} className="flex gap-2 text-emerald-200">
                <Check className="mt-0.5 size-4 shrink-0" /> {r}
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl bg-white/[0.06] px-3 py-2 text-sm">{a.action}</p>
        </div>
      )}

      <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-black/20 p-4 text-sm leading-relaxed">{m.body}</div>
      {m.verdict !== 'ok' && <p className="mt-2 text-xs text-dim">Links desativados por segurança: copie e confira antes, se for preciso.</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onTask} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
          <ListTodo className="size-4" /> {m.verdict === 'ok' ? 'Criar tarefa' : 'Criar tarefa de verificação'}
        </button>
        {m.verdict === 'ok' && (
          <button onClick={onDraft} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-void hover:bg-white/90">
            <Sparkles className="size-4" /> Rascunhar resposta com o Ayran
          </button>
        )}
        <button onClick={onDelete} className="ml-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm text-dim hover:bg-white/10 hover:text-red-300">
          <Trash2 className="size-4" /> Apagar
        </button>
      </div>
    </article>
  )
}

function Checker({ onAuthError }: { onAuthError: () => void }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<ScamAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(e: React.FormEvent) {
    e.preventDefault()
    if (text.trim().length < 3) return
    setBusy(true)
    setError('')
    try {
      setResult(await analyzeEmail(text))
    } catch (err) {
      if (err instanceof AuthError) return onAuthError()
      setError(err instanceof Error ? err.message : 'Não consegui analisar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={run} className="glass grid gap-4 rounded-[28px] p-5 lg:grid-cols-2">
      <div>
        <label htmlFor="eml" className="mb-2 block text-sm font-medium">
          Cole aqui o e-mail suspeito (com remetente, assunto e texto)
        </label>
        <textarea
          id="eml"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={'De: Banco <suporte@banco-exemplo.com>\nAssunto: Sua conta será bloqueada\n\nTexto do e-mail…'}
          className="scroll-thin w-full resize-y rounded-2xl border border-white/15 bg-black/20 p-3 text-sm outline-none placeholder:text-dim focus:border-white/40"
        />
        <button disabled={busy || text.trim().length < 3} className="mt-3 rounded-full bg-white px-5 py-2 text-sm font-medium text-void hover:bg-white/90 disabled:opacity-40">
          {busy ? 'Analisando…' : 'Analisar'}
        </button>
        {error && <ErrorLine message={error} />}
      </div>
      <div aria-live="polite">
        {result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <VerdictChip verdict={result.verdict} label={result.label} />
              <span className={`text-xs ${verdictColor(result.verdict)}`}>Risco {result.score} de 100</span>
            </div>
            <ul className="space-y-1.5 text-sm">
              {result.reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/60" /> {r}
                </li>
              ))}
            </ul>
            <p className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm">{result.action}</p>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-dim">O resultado aparece aqui. Análise real, feita no servidor: o e-mail não sai do Ayran.</p>
        )}
      </div>
    </form>
  )
}
