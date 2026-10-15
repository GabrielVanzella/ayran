import { useEffect, useState } from 'react'
import {
  ArrowRight,
  AudioLines,
  CalendarDays,
  FolderGit2,
  ListTodo,
  Mail,
  MessageSquare,
  Mic,
  Palette,
  Sparkles,
  TrendingUp,
  Users,
  Droplets,
  Lightbulb,
  MapPin,
  Newspaper,
  Send,
  Umbrella,
  Wind,
} from 'lucide-react'
import TasksCard from './TasksCard'
import BriefingCard from './BriefingCard'
import { AgendaCard, MailCard } from './HomeCards'
import { CompanyKpis, ProjectsCard, TeamCard } from './HomeCompany'
import LocationPicker from './LocationPicker'
import {
  BASE,
  getNews,
  listIdeas,
  timeAgo,
  type DayForecast,
  type Idea,
  type Location,
  type NewsItem,
  type Scene,
  type Weather,
} from '../lib/api'
import { EXTRA_SCENES, SCENES, weatherIcon, weekday, type Pin } from '../lib/weather'
import { useBrand } from '../lib/brand'
import type { Tab } from '../App'

export type HomeProps = Props

type Props = {
  userName: string
  online: boolean
  scene: Scene
  cityName: string | null
  cityState: 'idle' | 'generating' | 'ready'
  onCityChanged: () => void
  pinned: Pin
  onPin: (s: Pin) => void
  weather: Weather | null
  weatherError: boolean
  location: Location | null
  onLocation: (l: Location) => void
  onAsk: (prompt: string) => void
  onGo: (tab: Tab) => void
  onAuthError: () => void
  isAdmin: boolean
  onVoice: () => void
  onOpenMail: (id: string) => void
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

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    getNews().then((n) => setNews(n.slice(0, 5))).catch(() => {})
    listIdeas().then((i) => setIdeas(i.filter((x) => x.status !== 'feita').slice(0, 4))).catch(() => {})
    return () => clearInterval(t)
  }, [])

  const first = p.userName.split(' ')[0]
  const brand = useBrand()

  return (
    <div className="mx-auto max-w-7xl">
      {/* ---------- hero: sem cartao, direto sobre a paisagem de fundo ---------- */}
      <section className="flex min-h-[max(440px,calc(100svh-17rem))] flex-col justify-between gap-10 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="scroll-thin -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Cena de fundo">
            <ScenePill active={p.pinned === null} onClick={() => p.onPin(null)}>
              Padrão
            </ScenePill>
            <ScenePill active={p.pinned === 'auto'} onClick={() => p.onPin('auto')}>
              Clima
            </ScenePill>
            {[...EXTRA_SCENES.filter((s) => s.id !== 'custom' || brand.has_hero), ...SCENES].map((s) => (
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
          <PhotoCredit scene={p.scene} />
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
            <button
              type="button"
              onClick={p.onVoice}
              title="Conversar por voz"
              aria-label="Conversar com o Ayran por voz"
              className="grid size-10 place-items-center rounded-full border border-white/30 transition hover:bg-white/15"
            >
              <Mic className="size-4" />
            </button>
            <button className="grid size-10 place-items-center rounded-full bg-white text-void transition hover:bg-white/90" aria-label="Enviar">
              <Send className="size-4" />
            </button>
          </form>
          <button
            onClick={p.onVoice}
            className="mt-3 flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-void transition hover:bg-white/90"
          >
            <AudioLines className="size-4" /> Falar com o Ayran
          </button>
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

      {/* ---------- acesso rapido a tudo ---------- */}
      <nav aria-label="Acesso rápido" className="mb-4">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
          {SHORTCUTS.filter((x) => !x.admin || p.isAdmin).map(({ label, icon: Icon, tab, voice }) => (
            <li key={label}>
              <button
                onClick={() => (voice ? p.onVoice() : p.onGo(tab!))}
                className="glass-pill flex h-full w-full flex-col items-center gap-1.5 rounded-3xl px-2 py-3 text-xs transition hover:bg-white/10"
              >
                <Icon className="size-5" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-4 lg:grid-cols-12">
      {/* ---------- resumo do dia, e-mail e agenda ---------- */}
      <div className="order-1 lg:col-span-12">
        <BriefingCard onAuthError={p.onAuthError} />
      </div>
      <div className="order-1 lg:col-span-6">
        <MailCard onOpen={p.onOpenMail} onMore={() => p.onGo('mail')} onAuthError={p.onAuthError} />
      </div>
      <div className="order-1 lg:col-span-6">
        <AgendaCard onMore={() => p.onGo('agenda')} onAuthError={p.onAuthError} />
      </div>

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
          </>
        ) : (
          <div className="grid h-full min-h-48 place-items-center text-center text-sm text-dim">
            {p.weatherError ? 'Não consegui consultar o clima agora.' : 'Carregando o clima…'}
          </div>
        )}
      </section>

      {/* ---------- empresa: indicadores, projetos e equipe ---------- */}
      <div className="order-3 grid gap-4 md:grid-cols-2 lg:col-span-8">
        <CompanyKpis onMore={() => p.onGo('business')} onAuthError={p.onAuthError} />
        <div className="grid gap-4">
          <ProjectsCard onMore={() => p.onGo('projects')} onAuthError={p.onAuthError} />
          <TeamCard onMore={() => p.onGo('business')} />
        </div>
      </div>

      {/* ---------- noticias + ideias ---------- */}
      <div className="order-3 lg:col-span-4">
        <TasksCard onMore={() => p.onGo('tasks')} onAuthError={p.onAuthError} />
      </div>

      <section className="glass order-4 rounded-[28px] p-5 lg:col-span-5">
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

      <section className="glass order-5 rounded-[28px] p-5 lg:col-span-3">
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

const SHORTCUTS: { label: string; icon: typeof Mic; tab?: Tab; voice?: boolean; admin?: boolean }[] = [
  { label: 'Falar', icon: AudioLines, voice: true },
  { label: 'Chat', icon: MessageSquare, tab: 'chat' },
  { label: 'Criar imagem', icon: Palette, tab: 'create' },
  { label: 'E-mail', icon: Mail, tab: 'mail' },
  { label: 'Agenda', icon: CalendarDays, tab: 'agenda' },
  { label: 'Tarefas', icon: ListTodo, tab: 'tasks' },
  { label: 'Negócio', icon: TrendingUp, tab: 'business' },
  { label: 'Projetos', icon: FolderGit2, tab: 'projects' },
  { label: 'Ideias', icon: Lightbulb, tab: 'ideas' },
  { label: 'Notícias', icon: Newspaper, tab: 'news' },
  { label: 'Recursos', icon: Sparkles, tab: 'recursos' },
  { label: 'Equipe', icon: Users, tab: 'team', admin: true },
]

type Credit = { title: string; author: string; license: string; page: string }
let creditsCache: Promise<Record<string, Credit>> | null = null

/** Credito da foto de fundo (as licencas CC BY / CC BY-SA exigem citar o autor). */
function PhotoCredit({ scene }: { scene: string }) {
  const [c, setC] = useState<Credit | null>(null)
  useEffect(() => {
    creditsCache ??= fetch(`${BASE}/scenes/credits.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    creditsCache.then((all) => setC(all[scene] ?? null))
  }, [scene])
  if (!c) return <span />
  return (
    <p className="glow-text order-last basis-full text-right text-[11px] text-white/70">
      Foto:{' '}
      <a href={c.page} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
        {c.author}
      </a>{' '}
      · {c.license} · Wikimedia Commons
    </p>
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

function NowIcon({ weather }: { weather: Weather }) {
  const Icon = weatherIcon(weather.current.code, weather.current.is_day)
  return <Icon className="size-5" />
}
