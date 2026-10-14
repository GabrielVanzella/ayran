import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Lightbulb, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { AuthError, createTask, deleteTask, listTasks, updateTask, type Task, type TaskStatus } from '../lib/api'

type Filter = 'abertas' | 'hoje' | 'atrasadas' | 'concluidas' | 'todas'

const STATUS_LABEL: Record<TaskStatus, string> = { pendente: 'Pendente', andamento: 'Em andamento', concluida: 'Concluída' }
const NEXT: Record<TaskStatus, TaskStatus> = { pendente: 'andamento', andamento: 'concluida', concluida: 'pendente' }

/** Data local de hoje como AAAA-MM-DD (o <input type="date"> e o servidor usam esse formato). */
export const todayISO = () => new Date().toLocaleDateString('sv-SE')

export function dueInfo(task: Task): { label: string; tone: 'late' | 'today' | 'soon' | 'later' | 'none' } {
  if (!task.due_date) return { label: 'Sem prazo', tone: 'none' }
  const today = todayISO()
  const days = Math.round((new Date(task.due_date + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000)
  if (task.status !== 'concluida' && days < 0) return { label: days === -1 ? 'Atrasada (ontem)' : `Atrasada há ${-days} dias`, tone: 'late' }
  if (days === 0) return { label: 'Hoje', tone: 'today' }
  if (days === 1) return { label: 'Amanhã', tone: 'soon' }
  return { label: new Date(task.due_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', ''), tone: 'later' }
}

const TONE: Record<string, string> = {
  late: 'bg-red-500/15 text-red-300',
  today: 'bg-white text-void',
  soon: 'bg-white/15 text-ink',
  later: 'border border-white/15 text-dim',
  none: 'text-dim',
}

export default function Tasks({ onAuthError }: { onAuthError: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('abertas')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [due, setDue] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) return onAuthError()
      setError(e instanceof Error ? e.message : 'Algo deu errado')
    },
    [onAuthError],
  )

  const refresh = useCallback(() => {
    listTasks().then(setTasks).catch(fail).finally(() => setLoading(false))
  }, [fail])
  useEffect(refresh, [refresh])

  const today = todayISO()
  const counts = useMemo(
    () => ({
      abertas: tasks.filter((t) => t.status !== 'concluida').length,
      hoje: tasks.filter((t) => t.status !== 'concluida' && t.due_date === today).length,
      atrasadas: tasks.filter((t) => t.status !== 'concluida' && t.due_date && t.due_date < today).length,
      concluidas: tasks.filter((t) => t.status === 'concluida').length,
      todas: tasks.length,
    }),
    [tasks, today],
  )
  const visible = tasks.filter((t) => {
    if (filter === 'abertas') return t.status !== 'concluida'
    if (filter === 'hoje') return t.status !== 'concluida' && t.due_date === today
    if (filter === 'atrasadas') return t.status !== 'concluida' && !!t.due_date && t.due_date < today
    if (filter === 'concluidas') return t.status === 'concluida'
    return true
  })

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || adding) return
    setAdding(true)
    setError('')
    try {
      const t = await createTask({ title: title.trim(), details: details.trim(), due_date: due || null })
      setTasks((list) => [t, ...list])
      setTitle('')
      setDetails('')
      setDue('')
    } catch (err) {
      fail(err)
    } finally {
      setAdding(false)
    }
  }

  async function patch(task: Task, change: Parameters<typeof updateTask>[1]) {
    setError('')
    try {
      const updated = await updateTask(task.id, change)
      setTasks((list) => list.map((t) => (t.id === task.id ? updated : t)))
    } catch (err) {
      fail(err)
    }
  }

  async function remove(task: Task) {
    if (!confirm(`Apagar a tarefa "${task.title}"?`)) return
    try {
      await deleteTask(task.id)
      setTasks((list) => list.filter((t) => t.id !== task.id))
    } catch (err) {
      fail(err)
    }
  }

  const field = 'rounded-full border border-line bg-white/[0.06] px-4 py-2.5 outline-none focus:border-white/40'
  const filters: [Filter, string][] = [
    ['abertas', 'Abertas'],
    ['hoje', 'Hoje'],
    ['atrasadas', 'Atrasadas'],
    ['concluidas', 'Concluídas'],
    ['todas', 'Todas'],
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <form onSubmit={add} className="glass space-y-3 rounded-[28px] p-5">
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="tarefa-titulo">
            Título da tarefa
          </label>
          <input
            id="tarefa-titulo"
            name="titulo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            autoComplete="off"
            placeholder="Nova tarefa…"
            className={`${field} min-w-0 flex-1 basis-60`}
          />
          <label className="sr-only" htmlFor="tarefa-prazo">
            Prazo
          </label>
          <input
            id="tarefa-prazo"
            name="prazo"
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className={`${field} text-dim`}
          />
          <button
            disabled={!title.trim() || adding}
            className="flex items-center gap-2 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-void transition hover:bg-neon-soft disabled:opacity-40"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Adicionar
          </button>
        </div>
        <label className="sr-only" htmlFor="tarefa-detalhes">
          Detalhes
        </label>
        <input
          id="tarefa-detalhes"
          name="detalhes"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={2000}
          autoComplete="off"
          placeholder="Detalhes (opcional)"
          className={`${field} w-full text-sm`}
        />
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => setDue(todayISO())} className="rounded-full border border-line px-3 py-1 text-dim transition hover:text-ink">
            Hoje
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date()
              d.setDate(d.getDate() + 1)
              setDue(d.toLocaleDateString('sv-SE'))
            }}
            className="rounded-full border border-line px-3 py-1 text-dim transition hover:text-ink"
          >
            Amanhã
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date()
              d.setDate(d.getDate() + 7)
              setDue(d.toLocaleDateString('sv-SE'))
            }}
            className="rounded-full border border-line px-3 py-1 text-dim transition hover:text-ink"
          >
            Em 1 semana
          </button>
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            {error}
          </p>
        )}
      </form>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar tarefas">
        {filters.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              filter === id ? 'bg-white text-void' : 'border border-line text-dim hover:border-white/40 hover:text-ink'
            }`}
          >
            {label} <span className={filter === id ? 'opacity-60' : 'opacity-70'}>{counts[id]}</span>
          </button>
        ))}
      </div>

      <section className="glass rounded-[28px] p-2">
        {loading ? (
          <div className="grid place-items-center py-12 text-dim">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-dim">
            {filter === 'concluidas' ? 'Nada concluído ainda.' : filter === 'todas' ? 'Nenhuma tarefa ainda. Crie a primeira acima.' : 'Nada por aqui. Tudo em dia!'}
          </p>
        ) : (
          <ul className="divide-y divide-white/10">
            {visible.map((t) => {
              const d = dueInfo(t)
              const done = t.status === 'concluida'
              return (
                <li key={t.id} className="px-3 py-3">
                  {editing === t.id ? (
                    <EditRow
                      task={t}
                      onCancel={() => setEditing(null)}
                      onSave={async (change) => {
                        await patch(t, change)
                        setEditing(null)
                      }}
                    />
                  ) : (
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => patch(t, { status: done ? 'pendente' : 'concluida' })}
                        aria-label={done ? 'Reabrir tarefa' : 'Concluir tarefa'}
                        aria-pressed={done}
                        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border transition ${
                          done ? 'border-white bg-white text-void' : 'border-white/30 text-transparent hover:border-white hover:text-white/60'
                        }`}
                      >
                        <Check className="size-4" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium leading-snug ${done ? 'text-dim line-through' : ''}`}>{t.title}</p>
                        {t.details && <p className="mt-0.5 whitespace-pre-wrap text-sm text-dim">{t.details}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 ${TONE[d.tone]}`}>
                            <CalendarDays className="size-3" /> {d.label}
                          </span>
                          {t.idea_id && (
                            <span className="flex items-center gap-1 text-dim">
                              <Lightbulb className="size-3" /> veio de uma ideia
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => patch(t, { status: NEXT[t.status] })}
                        title="Mudar o status"
                        className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
                          t.status === 'andamento' ? 'bg-white/15 text-ink' : 'border border-line text-dim hover:text-ink'
                        }`}
                      >
                        {STATUS_LABEL[t.status]}
                      </button>
                      <button onClick={() => setEditing(t.id)} aria-label="Editar tarefa" className="rounded-full p-2 text-dim hover:bg-white/10 hover:text-ink">
                        <Pencil className="size-4" />
                      </button>
                      <button onClick={() => remove(t)} aria-label="Apagar tarefa" className="rounded-full p-2 text-dim hover:bg-white/10 hover:text-red-300">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function EditRow({ task, onSave, onCancel }: { task: Task; onSave: (c: { title: string; details: string; due_date: string | null }) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(task.title)
  const [details, setDetails] = useState(task.details)
  const [due, setDue] = useState(task.due_date ?? '')
  const [saving, setSaving] = useState(false)
  const field = 'w-full rounded-full border border-line bg-white/[0.06] px-4 py-2 text-sm outline-none focus:border-white/40'
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!title.trim()) return
        setSaving(true)
        await onSave({ title: title.trim(), details: details.trim(), due_date: due || null })
        setSaving(false)
      }}
    >
      <input aria-label="Título" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className={field} autoFocus />
      <input aria-label="Detalhes" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} placeholder="Detalhes" className={field} />
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Prazo" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${field} w-auto text-dim`} />
        <button disabled={saving || !title.trim()} className="ml-auto rounded-full bg-neon px-4 py-2 text-sm font-semibold text-void disabled:opacity-40">
          Salvar
        </button>
        <button type="button" onClick={onCancel} aria-label="Cancelar edição" className="rounded-full p-2 text-dim hover:bg-white/10 hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
    </form>
  )
}
