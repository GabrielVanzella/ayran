import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, BellRing, CalendarDays, Check, Code2, ListTodo, Mail, Sparkles, TrendingUp, X } from 'lucide-react'
import { AuthError, listNotifications, timeAgo, type AppNotification } from '../lib/api'
import { ExampleTag } from './ui'
import { isPresenting } from '../lib/present'

type Target = AppNotification['target']
type Props = { onAuthError: () => void; onOpen: (t: Target) => void }

const SEEN_KEY = 'ayran.notif.seen'
const ICON = { mail: Mail, tasks: ListTodo, agenda: CalendarDays, briefing: Sparkles, business: TrendingUp, dev: Code2 }
const DOT = { bad: 'bg-red-400', warn: 'bg-amber-300', info: 'bg-sky-300' }

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}
function saveSeen(s: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300)))
  } catch {
    /* sem armazenamento: so nao lembra o que foi lido */
  }
}

/** Sino do topo: central de avisos de tudo (e-mail, tarefas, agenda, negocio) + aviso flutuante quando algo novo chega. */
export default function NotificationBell({ onAuthError, onOpen }: Props) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [seen, setSeen] = useState<Set<string>>(loadSeen)
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<AppNotification | null>(null)
  const known = useRef<Set<string> | null>(null) // ids ja vistos pelo app (nao gera aviso flutuante no 1o carregamento)
  const box = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    listNotifications()
      .then((list) => {
        if (known.current) {
          const fresh = list.find((n) => !known.current!.has(n.id) && n.source === 'real' && n.tone !== 'info') ?? list.find((n) => !known.current!.has(n.id) && n.kind === 'mail')
          if (fresh && !isPresenting()) setToast(fresh)
        }
        known.current = new Set(list.map((n) => n.id))
        setItems(list)
      })
      .catch((e) => e instanceof AuthError && onAuthError())
  }, [onAuthError])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    window.addEventListener('ayran:notify', refresh)
    return () => {
      clearInterval(t)
      window.removeEventListener('ayran:notify', refresh)
    }
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 9000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', click)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const unread = items.filter((n) => !seen.has(n.id))
  const urgent = unread.some((n) => n.tone === 'bad')

  function markSeen(ids: string[]) {
    setSeen((prev) => {
      const next = new Set(prev)
      ids.forEach((i) => next.add(i))
      saveSeen(next)
      return next
    })
  }
  function go(n: AppNotification) {
    markSeen([n.id])
    setOpen(false)
    setToast(null)
    onOpen(n.target)
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread.length ? `Notificações: ${unread.length} novas` : 'Notificações'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notificações"
        className="glass-pill relative grid size-11 shrink-0 place-items-center rounded-full transition hover:bg-white/10"
      >
        {urgent ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {unread.length > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-semibold ${urgent ? 'bg-red-500 text-white' : 'bg-white text-void'}`}>
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notificações" className="glass absolute right-0 top-14 z-40 w-[min(92vw,26rem)] rounded-[28px] p-3 shadow-2xl">
          <div className="mb-2 flex items-center gap-2 px-2">
            <h2 className="font-medium">Notificações</h2>
            {unread.length > 0 && (
              <button onClick={() => markSeen(items.map((n) => n.id))} className="ml-auto flex items-center gap-1 text-xs text-dim hover:text-ink">
                <Check className="size-3.5" /> Marcar tudo como lido
              </button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Fechar" className={`rounded-full p-1 text-dim hover:text-ink ${unread.length ? '' : 'ml-auto'}`}>
              <X className="size-4" />
            </button>
          </div>
          <ul className="scroll-thin max-h-[26rem] space-y-1 overflow-y-auto">
            {items.length === 0 && <li className="py-8 text-center text-sm text-dim">Tudo em dia. Nenhum aviso agora.</li>}
            {items.map((n) => {
              const Icon = ICON[n.kind]
              const isNew = !seen.has(n.id)
              return (
                <li key={n.id}>
                  <button onClick={() => go(n)} className="flex w-full items-start gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-white/10">
                    <span className="relative mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-white/10">
                      <Icon className="size-4" />
                      <span className={`absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-[var(--color-panel)] ${DOT[n.tone]}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm leading-snug ${isNew ? 'font-semibold' : ''}`}>{n.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-dim">{n.body}</span>
                      <span className="mt-1 flex items-center gap-2 text-[11px] text-dim">
                        {timeAgo(n.ts)}
                        {n.source === 'exemplo' && <ExampleTag text="Exemplo" />}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed right-4 top-20 z-50 w-[min(92vw,24rem)]">
          <button onClick={() => go(toast)} className="glass flex w-full items-start gap-3 rounded-3xl p-4 text-left shadow-2xl transition hover:bg-white/10">
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${DOT[toast.tone]}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-snug">{toast.title}</span>
              <span className="mt-0.5 block truncate text-xs text-dim">{toast.body}</span>
              <span className="mt-1.5 block text-xs underline underline-offset-4">Abrir</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
