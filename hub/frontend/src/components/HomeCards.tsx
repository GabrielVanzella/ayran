import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, CalendarDays, Mail } from 'lucide-react'
import { AuthError, listAgenda, listMail, simulateMail, timeAgo, type AgendaEvent, type Mail as MailT } from '../lib/api'
import { ExampleTag, VerdictChip } from './ui'
import { todayISO } from './Tasks'

function Head({ icon: Icon, title, badge, onMore, tag }: { icon: typeof Mail; title: string; badge?: React.ReactNode; onMore: () => void; tag?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Icon className="size-4 text-dim" />
      <h2 className="font-medium">{title}</h2>
      {badge}
      {tag}
      <button onClick={onMore} className="ml-auto flex items-center gap-1 text-xs text-dim transition hover:text-ink">
        ver tudo <ArrowRight className="size-3" />
      </button>
    </div>
  )
}

/** E-mails recentes na Home. Na demonstracao, um e-mail novo "chega" sozinho depois de alguns segundos. */
export function MailCard({ onOpen, onMore, onAuthError }: { onOpen: (id: string) => void; onMore: () => void; onAuthError: () => void }) {
  const [mails, setMails] = useState<MailT[] | null>(null)
  const [arrivedId, setArrivedId] = useState<string | null>(null)

  const load = useCallback(() => {
    listMail()
      .then(setMails)
      .catch((e) => e instanceof AuthError && onAuthError())
  }, [onAuthError])

  useEffect(() => {
    load()
    window.addEventListener('ayran:notify', load)
    return () => window.removeEventListener('ayran:notify', load)
  }, [load])

  // demonstracao: uma vez por sessao do navegador, chega um e-mail novo logo depois de abrir a Home
  useEffect(() => {
    let done = false
    try {
      done = sessionStorage.getItem('ayran.demo.arrived') === '1'
    } catch {
      /* sem armazenamento: simula de novo */
    }
    if (done) return
    const t = setTimeout(() => {
      simulateMail()
        .then((m) => {
          try {
            sessionStorage.setItem('ayran.demo.arrived', '1')
          } catch {
            /* ok */
          }
          setArrivedId(m.id)
          setMails((l) => [m, ...(l ?? [])])
          window.dispatchEvent(new Event('ayran:notify'))
        })
        .catch(() => {})
    }, 9000)
    return () => clearTimeout(t)
  }, [])

  const unread = (mails ?? []).filter((m) => !m.read)
  const risky = (mails ?? []).filter((m) => m.verdict === 'bad').length
  const shown = [...(mails ?? [])].sort((a, b) => Number(a.read) - Number(b.read) || b.received_at - a.received_at).slice(0, 4)

  return (
    <section className="glass rounded-[28px] p-5" aria-label="E-mail">
      <Head
        icon={Mail}
        title="E-mail"
        tag={<ExampleTag text="Caixa de exemplo" />}
        badge={unread.length > 0 && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px]">{unread.length} não lido{unread.length > 1 ? 's' : ''}</span>}
        onMore={onMore}
      />
      {mails === null ? (
        <p className="py-4 text-center text-sm text-dim">Carregando…</p>
      ) : shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-dim">Caixa vazia.</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => onOpen(m.id)}
                className={`w-full rounded-2xl px-2 py-2 text-left transition hover:bg-white/10 ${arrivedId === m.id ? 'bg-white/10 ring-1 ring-white/30' : ''}`}
              >
                <span className="flex items-center gap-2">
                  {!m.read && <span className="size-2 shrink-0 rounded-full bg-sky-300" aria-label="não lido" />}
                  <span className={`min-w-0 flex-1 truncate text-sm ${m.read ? 'text-dim' : 'font-semibold'}`}>{m.from_name}</span>
                  {arrivedId === m.id && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-void">NOVO</span>}
                  <span className="shrink-0 text-xs text-dim">{timeAgo(m.received_at)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-dim">{m.subject}</span>
                  {m.verdict !== 'ok' && <VerdictChip verdict={m.verdict} label={m.analysis?.label} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {risky > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <AlertTriangle className="size-4 shrink-0" /> {risky} e-mail{risky > 1 ? 's' : ''} com cara de golpe separado{risky > 1 ? 's' : ''} para você.
        </p>
      )}
    </section>
  )
}

const hhmm = (iso: string) => iso.slice(11, 16)

/** Compromissos de hoje, com destaque para o proximo e aviso de conflito. */
export function AgendaCard({ onMore, onAuthError }: { onMore: () => void; onAuthError: () => void }) {
  const [events, setEvents] = useState<AgendaEvent[] | null>(null)
  const load = useCallback(() => {
    listAgenda(todayISO(), 1)
      .then(setEvents)
      .catch((e) => e instanceof AuthError && onAuthError())
  }, [onAuthError])
  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const nowIso = new Date().toLocaleString('sv-SE').slice(0, 16).replace(' ', 'T')
  const today = (events ?? []).filter((e) => e.start.startsWith(todayISO()))
  const next = today.find((e) => e.end > nowIso)
  const conflicts = today.filter((e) => e.conflicts.length > 0).length

  return (
    <section className="glass rounded-[28px] p-5" aria-label="Agenda de hoje">
      <Head icon={CalendarDays} title="Agenda de hoje" tag={today.some((e) => e.demo) ? <ExampleTag text="Exemplo" /> : undefined} onMore={onMore} />
      {events === null ? (
        <p className="py-4 text-center text-sm text-dim">Carregando…</p>
      ) : today.length === 0 ? (
        <p className="py-4 text-center text-sm text-dim">Nenhum compromisso hoje.</p>
      ) : (
        <ul className="space-y-1">
          {today.slice(0, 5).map((e) => {
            const past = e.end <= nowIso
            const isNext = next?.id === e.id
            return (
              <li key={e.id} className={`flex items-center gap-3 rounded-2xl px-2 py-1.5 ${isNext ? 'bg-white/10' : ''}`}>
                <span className={`w-12 shrink-0 text-sm tabular-nums ${past ? 'text-dim' : ''}`}>{hhmm(e.start)}</span>
                <span className={`min-w-0 flex-1 truncate text-sm ${past ? 'text-dim line-through' : ''}`}>{e.title}</span>
                {isNext && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-void">PRÓXIMO</span>}
                {e.conflicts.length > 0 && <AlertTriangle className="size-4 shrink-0 text-amber-300" aria-label="conflito de horário" />}
              </li>
            )
          })}
          {today.length > 5 && <li className="px-2 pt-1 text-xs text-dim">+ {today.length - 5} compromissos</li>}
        </ul>
      )}
      {conflicts > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-amber-300/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="size-4 shrink-0" /> Há compromissos que se sobrepõem hoje. Abra a agenda para resolver.
        </p>
      )}
    </section>
  )
}
