import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, ListTodo, Loader2, Plus } from 'lucide-react'
import { AuthError, createTask, listTasks, updateTask, type Task } from '../lib/api'
import { dueInfo, todayISO } from './Tasks'

type Props = { onMore: () => void; onAuthError: () => void }

/** Cartao da Home: proximas tarefas abertas + criacao rapida (Enter). */
export default function TasksCard({ onMore, onAuthError }: Props) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [title, setTitle] = useState('')
  const [today, setToday] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) return onAuthError()
      setError(e instanceof Error ? e.message : 'Algo deu errado')
    },
    [onAuthError],
  )

  useEffect(() => {
    listTasks().then(setTasks).catch(fail)
  }, [fail])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || adding) return
    setAdding(true)
    setError('')
    try {
      const t = await createTask({ title: title.trim(), due_date: today ? todayISO() : null })
      setTasks((list) => [t, ...(list ?? [])])
      setTitle('')
    } catch (err) {
      fail(err)
    } finally {
      setAdding(false)
    }
  }

  async function complete(t: Task) {
    try {
      const updated = await updateTask(t.id, { status: 'concluida' })
      setTasks((list) => (list ?? []).map((x) => (x.id === t.id ? updated : x)))
    } catch (err) {
      fail(err)
    }
  }

  const open = (tasks ?? []).filter((t) => t.status !== 'concluida')
  const late = open.filter((t) => dueInfo(t).tone === 'late').length

  return (
    <section className="glass rounded-[28px] p-5">
      <div className="mb-3 flex items-center gap-2">
        <ListTodo className="size-4 text-dim" />
        <h2 className="font-medium">Tarefas</h2>
        {late > 0 && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">{late} atrasada{late > 1 ? 's' : ''}</span>}
        <button onClick={onMore} className="ml-auto flex items-center gap-1 text-xs text-dim transition hover:text-ink">
          ver tudo <ArrowRight className="size-3" />
        </button>
      </div>

      <form onSubmit={add} className="mb-3 flex items-center gap-2 rounded-full border border-line bg-white/[0.05] p-1 focus-within:border-white/40">
        <label className="sr-only" htmlFor="home-tarefa">
          Nova tarefa
        </label>
        <input
          id="home-tarefa"
          name="tarefa"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Nova tarefa…"
          className="min-w-0 flex-1 bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-dim"
        />
        <button
          type="button"
          aria-pressed={today}
          onClick={() => setToday((v) => !v)}
          title="Marcar o prazo para hoje"
          className={`rounded-full px-2.5 py-1 text-[11px] transition ${today ? 'bg-white/15 text-ink' : 'text-dim hover:text-ink'}`}
        >
          Hoje
        </button>
        <button
          disabled={!title.trim() || adding}
          aria-label="Adicionar tarefa"
          className="grid size-8 place-items-center rounded-full bg-white text-void transition hover:bg-white/90 disabled:opacity-40"
        >
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </button>
      </form>
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {tasks === null ? (
        <p className="py-4 text-center text-sm text-dim">Carregando…</p>
      ) : open.length === 0 ? (
        <p className="py-4 text-center text-sm text-dim">Nada pendente. Tudo em dia!</p>
      ) : (
        <ul className="space-y-1">
          {open.slice(0, 5).map((t) => {
            const d = dueInfo(t)
            return (
              <li key={t.id} className="flex items-center gap-2.5 rounded-2xl px-1 py-1.5">
                <button
                  onClick={() => complete(t)}
                  aria-label={`Concluir: ${t.title}`}
                  className="grid size-5 shrink-0 place-items-center rounded-full border border-white/30 text-transparent transition hover:border-white hover:text-white/60"
                >
                  <Check className="size-3.5" />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                <span className={`shrink-0 text-[11px] ${d.tone === 'late' ? 'text-red-300' : d.tone === 'today' ? 'text-ink' : 'text-dim'}`}>
                  {d.tone === 'none' ? '' : d.label}
                </span>
              </li>
            )
          })}
          {open.length > 5 && <li className="px-1 pt-1 text-xs text-dim">+ {open.length - 5} abertas</li>}
        </ul>
      )}
    </section>
  )
}
