import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus, Check, MapPin, Pencil, Trash2, X } from 'lucide-react'
import { AuthError, createEvent, deleteEvent, listAgenda, updateEvent, type AgendaEvent } from '../lib/api'
import { Empty, ErrorLine, ExampleTag, Loading, PageHeader } from './ui'
import { todayISO } from './Tasks'

type Props = { onAuthError: () => void }

const hhmm = (iso: string) => iso.slice(11, 16)
const dayOf = (iso: string) => iso.slice(0, 10)

function dayLabel(day: string): string {
  const today = todayISO()
  const diff = Math.round((new Date(day + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86_400_000)
  const date = new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return diff === 0 ? `Hoje · ${date}` : diff === 1 ? `Amanhã · ${date}` : date
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso + ':00')
  d.setMinutes(d.getMinutes() + minutes)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Agenda({ onAuthError }: Props) {
  const [events, setEvents] = useState<AgendaEvent[] | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) return onAuthError()
      setError(e instanceof Error ? e.message : 'Algo deu errado')
    },
    [onAuthError],
  )
  const load = useCallback(() => {
    setError('')
    listAgenda(undefined, 14).then(setEvents).catch(fail)
  }, [fail])
  useEffect(load, [load])

  const days = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>()
    for (const e of events ?? []) map.set(dayOf(e.start), [...(map.get(dayOf(e.start)) ?? []), e])
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [events])
  const byId = useMemo(() => new Map((events ?? []).map((e) => [e.id, e])), [events])

  async function remove(e: AgendaEvent) {
    if (!confirm(`Apagar "${e.title}"?`)) return
    try {
      await deleteEvent(e.id)
      setNote('Compromisso apagado.')
      load()
    } catch (err) {
      fail(err)
    }
  }

  // sugere mover para logo depois do compromisso que conflita (se for o mais tarde dos dois)
  async function resolve(e: AgendaEvent) {
    const others = e.conflicts.map((id) => byId.get(id)).filter((x): x is AgendaEvent => !!x)
    const end = others.reduce((m, o) => (o.end > m ? o.end : m), e.start)
    const duration = (new Date(e.end + ':00').getTime() - new Date(e.start + ':00').getTime()) / 60000
    const start = end
    try {
      await updateEvent(e.id, { start, end: addMinutes(start, duration) })
      setNote(`“${e.title}” foi movido para ${hhmm(start)}.`)
      load()
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader title="Agenda" tag={events?.some((e) => e.demo) ? <ExampleTag text="Compromissos de exemplo" /> : undefined} subtitle="Seus próximos 14 dias. O Ayran avisa quando dois compromissos se sobrepõem.">
        <button
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${adding ? 'bg-white text-void' : 'bg-white/10 hover:bg-white/20'}`}
        >
          <CalendarPlus className="size-4" /> Novo compromisso
        </button>
      </PageHeader>

      {note && (
        <p role="status" aria-live="polite" className="glass flex items-center gap-3 rounded-full px-5 py-2.5 text-sm">
          <Check className="size-4 shrink-0" /> {note}
        </p>
      )}
      {error && <ErrorLine message={error} onRetry={load} />}
      {adding && (
        <EventForm
          onCancel={() => setAdding(false)}
          onSave={async (v) => {
            try {
              await createEvent(v)
              setAdding(false)
              setNote('Compromisso criado.')
              load()
            } catch (err) {
              fail(err)
            }
          }}
        />
      )}

      {events === null ? (
        <Loading text="Carregando a agenda…" />
      ) : days.length === 0 ? (
        <div className="glass rounded-[28px]">
          <Empty title="Nada marcado nos próximos 14 dias" hint="Crie um compromisso ou peça ao Ayran, por voz, no Chat." />
        </div>
      ) : (
        days.map(([day, list]) => (
          <section key={day} aria-label={dayLabel(day)} className="glass rounded-[28px] p-4">
            <h3 className="mb-2 px-2 text-sm font-medium capitalize text-dim">{dayLabel(day)}</h3>
            <ul className="space-y-1">
              {list.map((e) =>
                editing === e.id ? (
                  <li key={e.id}>
                    <EventForm
                      initial={e}
                      onCancel={() => setEditing(null)}
                      onSave={async (v) => {
                        try {
                          await updateEvent(e.id, v)
                          setEditing(null)
                          setNote('Compromisso atualizado.')
                          load()
                        } catch (err) {
                          fail(err)
                        }
                      }}
                    />
                  </li>
                ) : (
                  <li key={e.id} className="group rounded-2xl px-2 py-2.5 hover:bg-white/5">
                    <div className="flex items-start gap-3">
                      <span className="w-24 shrink-0 pt-0.5 text-sm tabular-nums text-dim">
                        {hhmm(e.start)}–{hhmm(e.end)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{e.title}</p>
                        {(e.place || e.notes) && (
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-dim">
                            {e.place && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="size-3" /> {e.place}
                              </span>
                            )}
                            {e.notes && <span>{e.notes}</span>}
                          </p>
                        )}
                        {e.conflicts.length > 0 && (
                          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-amber-200">
                            <AlertTriangle className="size-3.5" /> Conflita com {e.conflicts.map((id) => `“${byId.get(id)?.title ?? '…'}”`).join(', ')}
                            <button onClick={() => resolve(e)} className="rounded-full bg-amber-300/15 px-2.5 py-0.5 hover:bg-amber-300/25">
                              Mover para depois
                            </button>
                          </p>
                        )}
                      </div>
                      {e.demo && <ExampleTag text="Exemplo" />}
                      <div className="flex shrink-0 gap-1 opacity-100 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                        <button onClick={() => setEditing(e.id)} aria-label={`Editar ${e.title}`} className="rounded-full p-1.5 text-dim hover:bg-white/10 hover:text-ink">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => remove(e)} aria-label={`Apagar ${e.title}`} className="rounded-full p-1.5 text-dim hover:bg-white/10 hover:text-red-300">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

function EventForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: AgendaEvent
  onSave: (v: { title: string; start: string; end: string; place: string; notes: string }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial ? dayOf(initial.start) : todayISO())
  const [from, setFrom] = useState(initial ? hhmm(initial.start) : '09:00')
  const [to, setTo] = useState(initial ? hhmm(initial.end) : '10:00')
  const [place, setPlace] = useState(initial?.place ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const invalid = to <= from
  const id = initial?.id ?? 'novo'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim() && !invalid) onSave({ title: title.trim(), start: `${date}T${from}`, end: `${date}T${to}`, place: place.trim(), notes: notes.trim() })
      }}
      className="glass grid gap-3 rounded-[28px] p-4 sm:grid-cols-6"
    >
      <div className="sm:col-span-6">
        <label htmlFor={`t-${id}`} className="mb-1 block text-xs text-dim">Título</label>
        <input id={`t-${id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required autoFocus placeholder="Ex.: Reunião com a Marina" className="field" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`d-${id}`} className="mb-1 block text-xs text-dim">Dia</label>
        <input id={`d-${id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="field" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`a-${id}`} className="mb-1 block text-xs text-dim">Começa</label>
        <input id={`a-${id}`} type="time" value={from} onChange={(e) => setFrom(e.target.value)} required className="field" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`b-${id}`} className="mb-1 block text-xs text-dim">Termina</label>
        <input id={`b-${id}`} type="time" value={to} onChange={(e) => setTo(e.target.value)} required aria-invalid={invalid} className="field" />
      </div>
      <div className="sm:col-span-3">
        <label htmlFor={`p-${id}`} className="mb-1 block text-xs text-dim">Local ou link (opcional)</label>
        <input id={`p-${id}`} value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} className="field" />
      </div>
      <div className="sm:col-span-3">
        <label htmlFor={`n-${id}`} className="mb-1 block text-xs text-dim">Observações (opcional)</label>
        <input id={`n-${id}`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} className="field" />
      </div>
      {invalid && (
        <p role="alert" className="text-xs text-red-300 sm:col-span-6">
          O horário de término precisa ser depois do início.
        </p>
      )}
      <div className="flex gap-2 sm:col-span-6">
        <button disabled={!title.trim() || invalid} className="rounded-full bg-white px-5 py-2 text-sm font-medium text-void hover:bg-white/90 disabled:opacity-40">
          Salvar
        </button>
        <button type="button" onClick={onCancel} className="flex items-center gap-1 rounded-full px-4 py-2 text-sm text-dim hover:bg-white/10 hover:text-ink">
          <X className="size-4" /> Cancelar
        </button>
      </div>
    </form>
  )
}
