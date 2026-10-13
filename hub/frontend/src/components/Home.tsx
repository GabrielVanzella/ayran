import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Cpu,
  Droplets,
  Loader2,
  HardDrive,
  Lightbulb,
  MapPin,
  Newspaper,
  Send,
  Umbrella,
  Wind,
} from 'lucide-react'
import Dial from './Dial'
import CityViewEditor from './CityViewEditor'
import LocationPicker from './LocationPicker'
import {
  getNews,
  getSystem,
  listChats,
  listIdeas,
  timeAgo,
  type ChatSummary,
  type DayForecast,
  type Idea,
  type Location,
  type NewsItem,
  type Scene,
  type SystemInfo,
  type Weather,
} from '../lib/api'
import { SCENES, weatherIcon, weekday } from '../lib/weather'
import type { Tab } from '../App'

type Props = {
  userName: string
  online: boolean
  scene: Scene
  cityName: string | null
  cityState: 'idle' | 'generating' | 'ready'
  onCityChanged: () => void
  pinned: Scene | null
  onPin: (s: Scene | null) => void
  weather: Weather | null
  weatherError: boolean
  location: Location | null
  onLocation: (l: Location) => void
  onAsk: (prompt: string) => void
  onGo: (tab: Tab) => void
  onAuthError: () => void
}

function greeting(h: number) {
  if (h < 5) return 'Boa madrugada'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const QUICK = [
  'Revise este código e aponte bugs',
  'Me ajude a organizar as prioridades de hoje',
  'Vamos fazer um brainstorm de ideias de produto',
]

export default function Home(p: Props) {
  const [now, setNow] = useState(new Date())
  const [ask, setAsk] = useState('')
  const [editingCity, setEditingCity] = useState(false)
  const [news, setNews] = useState<NewsItem[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [system, setSystem] = useState<SystemInfo | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    getNews().then((n) => setNews(n.slice(0, 5))).catch(() => {})
    listIdeas().then((i) => setIdeas(i.filter((x) => x.status !== 'feita').slice(0, 4))).catch(() => {})
    listChats().then(setChats).catch(() => {})
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let alive = true
    const load = () => getSystem().then((s) => alive && setSystem(s)).catch(() => {})
    load()
    const t = setInterval(load, 10_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const week = useMemo(() => weekActivity(chats), [chats])
  const first = p.userName.split(' ')[0]

  return (
    <div className="mx-auto max-w-7xl">
      {/* ---------- hero: sem cartao, direto sobre a paisagem de fundo ---------- */}
      <section className="flex min-h-[max(440px,calc(100svh-17rem))] flex-col justify-between gap-10 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="scroll-thin -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Cena de fundo">
            <ScenePill active={!p.pinned} onClick={() => p.onPin(null)}>
              Automático
            </ScenePill>
            {SCENES.map((s) => (
              <ScenePill key={s.id} active={p.pinned === s.id} onClick={() => p.onPin(s.id)}>
                {s.label}
              </ScenePill>
            ))}
          </div>

          <button
            onClick={() => document.getElementById('clima')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="glass-pill flex items-center gap-2.5 rounded-full py-2 pl-3 pr-4 text-sm transition hover:bg-white/10"
          >
            {p.weather && p.location ? (
              <>
                <NowIcon weather={p.weather} />
                <span className="tabular-nums">{Math.round(p.weather.current.temp)}°C</span>
                <span className="text-dim">
                  {p.weather.current.label} · {p.location.name}
                </span>
              </>
            ) : (
              <>
                <MapPin className="size-4" /> Escolher cidade
              </>
            )}
          </button>
          {p.cityName && p.cityState !== 'idle' && (
            <p role="status" className="glow-text order-last flex basis-full items-center justify-end gap-2 text-xs text-white/80">
              {p.cityState === 'generating' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> O Ayran está criando a vista de {p.cityName}…
                </>
              ) : (
                <>Vista de {p.cityName}, criada pelo Ayran</>
              )}
            </p>
          )}
        </div>

        <div className="max-w-2xl">
          <p className="glow-text text-sm text-white/85">
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="glow-text mt-1 text-7xl font-light tabular-nums leading-none sm:text-[8.5rem]">
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <h2 className="glow-text mt-4 text-2xl font-medium sm:text-4xl">
            {greeting(now.getHours())}, {first}.
          </h2>
          <p className="glow-text mt-1.5 flex items-center gap-2 text-sm text-white/80">
            <span className={`size-2 rounded-full ${p.online ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {p.online ? 'Ayran online e pronto.' : 'Ayran offline. Verifique o servidor.'}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (ask.trim()) p.onAsk(ask.trim())
            }}
            className="glass-pill mt-6 flex items-center gap-2 rounded-full p-1.5 focus-within:border-white/50"
          >
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="Pergunte ao Ayran…"
              aria-label="Pergunte ao Ayran"
              name="pergunta"
              autoComplete="off"
              enterKeyHint="send"
              className="min-w-0 flex-1 bg-transparent px-4 py-2 outline-none placeholder:text-white/60"
            />
            <button className="grid size-10 place-items-center rounded-full bg-white text-void transition hover:bg-white/90" aria-label="Enviar">
              <Send className="size-4" />
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => p.onAsk(q)}
                className="glass-pill rounded-full px-3.5 py-1.5 text-xs text-white/90 transition hover:bg-white/10"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
      {/* ---------- clima + previsao ---------- */}
      <section id="clima" className="glass order-2 scroll-mt-2 rounded-[28px] p-5 lg:col-span-4 lg:row-span-2">
        {!p.location || editingCity ? (
          <div>
            <h2 className="mb-1 text-lg font-medium">{p.location ? 'Trocar cidade' : 'Onde você está?'}</h2>
            <p className="mb-4 text-sm text-dim">O Ayran usa a cidade para mostrar o clima e trocar o cenário do painel.</p>
            <LocationPicker
              autoFocus={editingCity}
              onAuthError={p.onAuthError}
              onClose={p.location ? () => setEditingCity(false) : undefined}
              onPick={(l) => {
                p.onLocation(l)
                setEditingCity(false)
              }}
            />
          </div>
        ) : p.weather ? (
          <>
            <Forecast weather={p.weather} city={p.location.name} onChangeCity={() => setEditingCity(true)} />
            <CityViewEditor cityName={p.location.name} onSaved={p.onCityChanged} onAuthError={p.onAuthError} />
          </>
        ) : (
          <div className="grid h-full min-h-48 place-items-center text-center text-sm text-dim">
            {p.weatherError ? 'Não consegui consultar o clima agora.' : 'Carregando o clima…'}
          </div>
        )}
      </section>

      {/* ---------- servidor + servicos + atividade ---------- */}
      <div className="order-3 grid gap-4 md:grid-cols-2 lg:col-span-8">
        <section className="glass rounded-[28px] p-5 md:col-span-1">
          <header className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">Servidor</h2>
            <span className="max-w-[60%] truncate text-xs text-dim">{system?.model ? `modelo: ${system.model}` : 'sem modelo carregado'}</span>
          </header>
          <div className="flex flex-col items-center gap-3">
            {system ? (
              <>
                <Dial
                  value={system.gpu ? (system.gpu.used_mb / system.gpu.total_mb) * 100 : system.ram.percent}
                  label={system.gpu ? 'VRAM da GPU' : 'Memória RAM'}
                  caption={system.gpu ? `${(system.gpu.used_mb / 1024).toFixed(1)} de ${(system.gpu.total_mb / 1024).toFixed(0)} GB` : `${system.ram.used_gb} de ${system.ram.total_gb} GB`}
                />
                <div className="grid w-full grid-cols-3 gap-2 text-center text-xs">
                  <Metric icon={Cpu} label="CPU" value={`${Math.round(system.cpu)}%`} />
                  <Metric icon={HardDrive} label="Disco livre" value={`${system.disk.free_gb} GB`} />
                  <Metric icon={Cpu} label="RAM" value={`${Math.round(system.ram.percent)}%`} />
                </div>
              </>
            ) : (
              <div className="grid h-56 place-items-center text-sm text-dim">Lendo o servidor…</div>
            )}
          </div>
        </section>

        <div className="grid gap-4">
          <section className="glass rounded-[28px] p-5">
            <h2 className="mb-3 font-medium">Serviços</h2>
            <ul className="grid grid-cols-2 gap-2">
              {(system?.services ?? []).map((s) => (
                <li key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`size-2 shrink-0 rounded-full ${s.up ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className="truncate">{s.label}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-dim">{s.up ? s.hint : 'fora do ar'}</p>
                </li>
              ))}
              {!system && <li className="col-span-2 py-6 text-center text-sm text-dim">Verificando…</li>}
            </ul>
          </section>

          <section className="glass rounded-[28px] p-5">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="font-medium">Conversas</h2>
              <span className="text-xs text-dim">últimos 7 dias</span>
            </header>
            <ActivityChart week={week} />
          </section>
        </div>
      </div>

      {/* ---------- noticias + ideias ---------- */}
      <section className="glass order-4 rounded-[28px] p-5 lg:col-span-8">
        <Header icon={Newspaper} title="Notícias" onMore={() => p.onGo('news')} />
        {news.length === 0 && <p className="text-sm text-dim">Carregando manchetes…</p>}
        <ul className="divide-y divide-white/10">
          {news.map((n) => (
            <li key={n.link + n.title}>
              <a href={n.link} target="_blank" rel="noreferrer" className="group block py-2.5">
                <p className="text-sm leading-snug transition group-hover:text-white">{n.title}</p>
                <p className="mt-0.5 text-xs text-dim">
                  {n.source} · {timeAgo(n.published)}
                </p>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass order-5 rounded-[28px] p-5 lg:col-span-4">
        <Header icon={Lightbulb} title="Ideias em aberto" onMore={() => p.onGo('ideas')} />
        {ideas.length === 0 ? (
          <button onClick={() => p.onGo('ideas')} className="text-sm text-dim transition hover:text-ink">
            Nenhuma ideia ainda. Anote a primeira →
          </button>
        ) : (
          <ul className="space-y-2">
            {ideas.map((i) => (
              <li key={i.id} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <p className="text-sm font-medium">{i.title}</p>
                <p className="text-xs text-dim">{i.status === 'nova' ? 'nova' : 'em andamento'}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  )
}

function ScenePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs transition ${
        active ? 'bg-white text-void' : 'border border-white/20 bg-black/30 text-white/85 backdrop-blur hover:bg-black/50'
      }`}
    >
      {children}
    </button>
  )
}

function Header({ icon: Icon, title, onMore }: { icon: typeof Newspaper; title: string; onMore: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="size-4 text-dim" />
      <h2 className="font-medium">{title}</h2>
      <button onClick={onMore} className="ml-auto flex items-center gap-1 text-xs text-dim transition hover:text-ink">
        ver tudo <ArrowRight className="size-3" />
      </button>
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2">
      <Icon className="mx-auto mb-1 size-4 text-dim" />
      <p className="tabular-nums">{value}</p>
      <p className="text-[11px] text-dim">{label}</p>
    </div>
  )
}

function Forecast({ weather, city, onChangeCity }: { weather: Weather; city: string; onChangeCity: () => void }) {
  const c = weather.current
  const Icon = weatherIcon(c.code, c.is_day)
  const lo = Math.min(...weather.daily.map((d) => d.min))
  const hi = Math.max(...weather.daily.map((d) => d.max))
  const today = weather.daily[0]

  return (
    <div>
      <button onClick={onChangeCity} className="mb-4 flex items-center gap-1.5 text-sm text-dim transition hover:text-ink" aria-label="Trocar cidade">
        <MapPin className="size-4" /> {city}
      </button>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-6xl font-light tabular-nums leading-none">
            {Math.round(c.temp)}
            <span className="align-top text-2xl text-dim">°C</span>
          </p>
          <p className="mt-2 text-sm">{c.label}</p>
          <p className="text-xs text-dim">Sensação de {Math.round(c.feels)}°</p>
        </div>
        <Icon className="size-14 text-white/90" strokeWidth={1.2} />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
        <Stat icon={Droplets} label="Umidade" value={`${c.humidity}%`} />
        <Stat icon={Wind} label="Vento" value={`${Math.round(c.wind)} km/h`} />
        <Stat icon={Umbrella} label="Chuva hoje" value={today?.rain != null ? `${today.rain}%` : '–'} />
      </dl>

      <h3 className="mb-2 mt-6 text-xs uppercase tracking-wider text-dim">Próximos dias</h3>
      <ul className="space-y-1">
        {weather.daily.map((d, i) => (
          <DayRow key={d.date} day={d} first={i === 0} lo={lo} hi={hi} />
        ))}
      </ul>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Wind; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-2.5">
      <Icon className="mx-auto mb-1 size-4 text-dim" />
      <dd className="tabular-nums">{value}</dd>
      <dt className="text-[11px] text-dim">{label}</dt>
    </div>
  )
}

function DayRow({ day, first, lo, hi }: { day: DayForecast; first: boolean; lo: number; hi: number }) {
  const Icon = weatherIcon(day.code)
  const span = Math.max(1, hi - lo)
  const left = ((day.min - lo) / span) * 100
  const width = Math.max(8, ((day.max - day.min) / span) * 100)
  return (
    <li className="grid grid-cols-[3rem_1.5rem_2rem_1fr_2rem] items-center gap-2 rounded-xl px-1.5 py-1.5 text-sm" title={day.label}>
      <span className="capitalize">{first ? 'Hoje' : weekday(day.date)}</span>
      <Icon className="size-4 text-white/85" />
      <span className="text-right tabular-nums text-dim">{Math.round(day.min)}°</span>
      <span className="relative h-1.5 rounded-full bg-white/12">
        <span className="absolute inset-y-0 rounded-full bg-white/80" style={{ left: `${left}%`, width: `${width}%` }} />
      </span>
      <span className="tabular-nums">{Math.round(day.max)}°</span>
    </li>
  )
}

type Day = { label: string; count: number; today: boolean }

/** Conversas por dia nos ultimos 7 dias, a partir do historico real. */
function weekActivity(chats: ChatSummary[]): Day[] {
  const days: Day[] = []
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(start)
    d.setDate(d.getDate() - i)
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    const count = chats.filter((c) => c.updated_at * 1000 >= d.getTime() && c.updated_at * 1000 < next.getTime()).length
    days.push({ label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), count, today: i === 0 })
  }
  return days
}

function ActivityChart({ week }: { week: Day[] }) {
  const max = Math.max(1, ...week.map((d) => d.count))
  const total = week.reduce((a, d) => a + d.count, 0)
  return (
    <div>
      <div className="flex h-24 items-end gap-2" role="img" aria-label={`${total} conversas nos últimos 7 dias`}>
        {week.map((d, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-[10px] tabular-nums text-dim">{d.count || ''}</span>
            <span
              className={`w-full rounded-full ${d.today ? 'bg-white' : 'bg-white/30'}`}
              style={{ height: `${Math.max(6, (d.count / max) * 100)}%`, minHeight: 6 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {week.map((d, i) => (
          <span key={i} className={`flex-1 text-center text-[11px] capitalize ${d.today ? 'text-ink' : 'text-dim'}`}>
            {d.label}
          </span>
        ))}
      </div>
      {total === 0 && <p className="mt-3 text-center text-xs text-dim">Suas conversas com o Ayran aparecem aqui.</p>}
    </div>
  )
}

function NowIcon({ weather }: { weather: Weather }) {
  const Icon = weatherIcon(weather.current.code, weather.current.is_day)
  return <Icon className="size-5" />
}
