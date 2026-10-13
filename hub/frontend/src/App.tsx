import { useCallback, useEffect, useState } from 'react'
import { Home as HomeIcon, Lightbulb, LogOut, MessageSquare, Music2, Newspaper, Palette, Search, Settings2, Users } from 'lucide-react'
import Team from './components/Team'
import Create from './components/Create'
import Login from './components/Login'
import Home from './components/Home'
import Chat from './components/Chat'
import News from './components/News'
import Ideas from './components/Ideas'
import Music from './components/Music'
import Player from './components/Player'
import Orb from './components/Orb'
import Backdrop from './components/Backdrop'
import {
  AuthError,
  autoLogin,
  getSettings,
  getToken,
  getWeather,
  health,
  me,
  putSettings,
  setToken,
  type Location,
  type Scene,
  type Settings,
  type User,
  type Weather,
} from './lib/api'
import { loadPinnedScene, savePinnedScene, sceneByClock, sceneFromUrl } from './lib/weather'

export type Tab = 'home' | 'chat' | 'create' | 'news' | 'ideas' | 'music' | 'team'

const NAV: { id: Tab; label: string; icon: typeof HomeIcon; adminOnly?: boolean }[] = [
  { id: 'home', label: 'Início', icon: HomeIcon },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'create', label: 'Criar', icon: Palette },
  { id: 'news', label: 'Notícias', icon: Newspaper },
  { id: 'ideas', label: 'Ideias', icon: Lightbulb },
  { id: 'music', label: 'Música', icon: Music2 },
  { id: 'team', label: 'Equipe', icon: Users, adminOnly: true },
]

const TITLES: Record<Tab, string> = {
  home: 'Central',
  chat: 'Chat',
  create: 'Criar',
  news: 'Notícias',
  ideas: 'Ideias',
  music: 'Música',
  team: 'Equipe',
}

// O painel avancado (Open WebUI) so e alcancavel no proprio servidor, nunca pelo dominio publico.
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname)

function initialTab(): Tab {
  const h = location.hash.slice(1) as Tab
  return NAV.some((n) => n.id === h) ? h : 'home'
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [tab, setTabState] = useState<Tab>(initialTab)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [online, setOnline] = useState(true)
  const [weather, setWeather] = useState<Weather | null>(null)
  const [weatherError, setWeatherError] = useState(false)
  const [pinned, setPinned] = useState<Scene | null>(loadPinnedScene)
  const [query, setQuery] = useState('')

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const setTab = (t: Tab) => {
    setTabState(t)
    history.replaceState(null, '', `#${t}`)
  }

  useEffect(() => {
    const session = getToken() ? me().catch(() => null) : Promise.resolve(null)
    session
      .then((u) => u ?? autoLogin())
      .then((u) => (u ? setUser(u) : setToken(null)))
      .finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    if (!user) return
    getSettings()
      .then(setSettings)
      .catch((e) => e instanceof AuthError && logout())
    const ping = () => health().then(setOnline)
    ping()
    const t = setInterval(ping, 60_000)
    return () => clearInterval(t)
  }, [user, logout])

  const lat = settings?.location?.lat
  const lon = settings?.location?.lon
  useEffect(() => {
    if (lat == null || lon == null) {
      setWeather(null)
      return
    }
    let alive = true
    const load = () =>
      getWeather(lat, lon)
        .then((w) => {
          if (alive) {
            setWeather(w)
            setWeatherError(false)
          }
        })
        .catch((e) => {
          if (e instanceof AuthError) logout()
          else if (alive) setWeatherError(true)
        })
    load()
    const t = setInterval(load, 15 * 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [lat, lon, logout])

  const ask = useCallback((prompt: string) => {
    setPendingPrompt(prompt)
    setTab('chat')
  }, [])
  const consumed = useCallback(() => setPendingPrompt(null), [])

  async function changeMusic(url: string) {
    setSettings((s) => (s ? { ...s, spotify: url } : s))
    await putSettings({ spotify: url }).catch(() => {})
  }

  async function changeLocation(location: Location) {
    setSettings((s) => (s ? { ...s, location } : s))
    await putSettings({ location }).catch(() => {})
  }

  function pin(scene: Scene | null) {
    setPinned(scene)
    savePinnedScene(scene)
  }

  // Cena: o que o usuario fixou > ?scene= na URL > clima atual > hora do dia
  const scene: Scene = pinned ?? sceneFromUrl() ?? weather?.scene ?? sceneByClock()

  if (checking) {
    return (
      <div data-scene={scene} className="grid h-full place-items-center" style={{ background: 'var(--scene-fallback)' }}>
        <Orb size={64} thinking />
      </div>
    )
  }
  if (!user) {
    return (
      <div data-scene={scene} className="relative h-full overflow-y-auto">
        <Backdrop scene={scene} soft />
        <div className="relative min-h-full">
          <Login onLogin={setUser} />
        </div>
      </div>
    )
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || 'A'
  const isAdmin = user.role === 'admin'
  const nav = NAV.filter((n) => !n.adminOnly || isAdmin)

  return (
    <div data-scene={scene} className="relative h-full overflow-hidden">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <Backdrop scene={scene} soft={tab !== 'home'} />

      <div className="relative mx-auto flex h-full max-w-[1600px] p-2 sm:p-4">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* barra de topo */}
          <header className="flex items-center gap-3 px-2 pt-1 sm:gap-4 sm:px-3">
            <div className="flex items-center gap-2.5">
              <Orb size={30} />
              <span className="hidden text-lg font-semibold tracking-wide sm:inline">Ayran</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (query.trim()) {
                  ask(query.trim())
                  setQuery('')
                }
              }}
              className="glass-pill mx-auto flex min-w-0 max-w-xl flex-1 items-center gap-2 rounded-full px-4 py-2 focus-within:border-white/40"
            >
              <Search className="size-4 shrink-0 text-dim" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pergunte algo ao Ayran…"
                aria-label="Pergunte algo ao Ayran"
                name="busca"
                autoComplete="off"
                enterKeyHint="send"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
              />
            </form>

            <div className="glass-pill flex shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-1 sm:pr-4">
              <span className="grid size-8 place-items-center rounded-full bg-white text-sm font-semibold text-void">{initial}</span>
              <span className="hidden text-sm leading-tight sm:block">
                {user.name.split(' ')[0]}
                <span className="block text-[11px] text-dim">{user.role === 'admin' ? 'Administrador' : 'Usuário'}</span>
              </span>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 gap-2 pt-4 sm:gap-5">
            {/* navegacao lateral em capsula (desktop) */}
            <nav className="hidden shrink-0 flex-col items-center justify-between py-1 md:flex" aria-label="Navegação">
              <div className="glass-pill flex flex-col gap-2 rounded-full p-2">
                {nav.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    title={label}
                    aria-label={label}
                    aria-current={tab === id ? 'page' : undefined}
                    className={`grid size-11 place-items-center rounded-full transition ${
                      tab === id ? 'bg-white text-void shadow-lg shadow-black/30' : 'text-dim hover:bg-white/10 hover:text-ink'
                    }`}
                  >
                    <Icon className="size-5" />
                  </button>
                ))}
              </div>
              <div className="glass-pill flex flex-col gap-1 rounded-full p-2">
                {IS_LOCAL && (
                  <a
                    href={`http://${location.hostname}:8080`}
                    target="_blank"
                    rel="noreferrer"
                    title="Painel avançado (Open WebUI)"
                    aria-label="Painel avançado"
                    className="grid size-11 place-items-center rounded-full text-dim transition hover:bg-white/10 hover:text-ink"
                  >
                    <Settings2 className="size-5" />
                  </a>
                )}
                <button
                  onClick={logout}
                  title="Sair"
                  aria-label="Sair"
                  className="grid size-11 place-items-center rounded-full text-dim transition hover:bg-white/10 hover:text-red-300"
                >
                  <LogOut className="size-5" />
                </button>
              </div>
            </nav>

            <main id="conteudo" tabIndex={-1} className="scroll-thin min-h-0 min-w-0 flex-1 overflow-y-auto px-1 pb-3 outline-none sm:px-2">
              <h1 className="sr-only">Ayran — {TITLES[tab]}</h1>
              {tab === 'home' && (
                <Home
                  userName={user.name}
                  online={online}
                  scene={scene}
                  pinned={pinned}
                  onPin={pin}
                  weather={weather}
                  weatherError={weatherError}
                  location={settings?.location ?? null}
                  onLocation={changeLocation}
                  onAsk={ask}
                  onGo={setTab}
                  onAuthError={logout}
                />
              )}
              {/* o chat fica montado pra resposta continuar chegando mesmo trocando de tela */}
              <div className={tab === 'chat' ? 'h-full' : 'hidden'}>
                <Chat userName={user.name} pendingPrompt={pendingPrompt} onPromptConsumed={consumed} onAuthError={logout} />
              </div>
              {tab === 'create' && <Create onAuthError={logout} />}
              {tab === 'news' && <News onAuthError={logout} />}
              {tab === 'ideas' && <Ideas onAuthError={logout} onDevelop={ask} />}
              {tab === 'music' && settings && <Music current={settings.spotify} onChange={changeMusic} />}
              {tab === 'team' && isAdmin && <Team onAuthError={logout} />}
            </main>
          </div>

          {settings?.spotify && (
            <div className="px-0 pt-3 sm:px-14">
              <div className="overflow-hidden rounded-3xl border border-white/15 shadow-2xl shadow-black/50">
                <Player url={settings.spotify} />
              </div>
            </div>
          )}

          {/* navegacao inferior (celular) */}
          <nav className="glass-pill mt-2 flex rounded-3xl pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navegação">
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${tab === id ? 'text-white' : 'text-dim'}`}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}
