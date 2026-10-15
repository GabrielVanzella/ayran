import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, FolderGit2, Home as HomeIcon, Lightbulb, ListTodo, Mail as MailIcon, MessageSquare, Newspaper, Palette, Sparkles, TrendingUp, Users } from 'lucide-react'
import Account from './components/Account'
import Tasks from './components/Tasks'
import Team from './components/Team'
import Create from './components/Create'
import Login from './components/Login'
import Chat from './components/Chat'
import News from './components/News'
import Ideas from './components/Ideas'
import Showcase from './components/Showcase'
import Mail from './components/Mail'
import Agenda from './components/Agenda'
import Business from './components/Business'
import Projects from './components/Projects'
import NotificationBell from './components/NotificationBell'
import { applySkin, loadSkin, type SkinId } from './lib/skin'
import { SKIN_COMPONENTS } from './skins'
import SkinPicker from './components/SkinPicker'
import Orb from './components/Orb'
import Backdrop from './components/Backdrop'
import {
  AuthError,
  autoLogin,
  BASE,
  getCityScene,
  getSettings,
  getToken,
  getWeather,
  health,
  me,
  putSettings,
  reverseCity,
  setToken,
  type Location,
  type Scene,
  type Settings,
  type User,
  type Weather,
} from './lib/api'
import { loadPinnedScene, savePinnedScene, sceneByClock, sceneFromUrl, type Pin } from './lib/weather'
import { useBrand } from './lib/brand'
import { usePresenting } from './lib/present'

export type Tab = 'home' | 'chat' | 'create' | 'news' | 'ideas' | 'tasks' | 'mail' | 'agenda' | 'business' | 'projects' | 'recursos' | 'team'

const NAV: { id: Tab; label: string; icon: typeof HomeIcon; adminOnly?: boolean }[] = [
  { id: 'home', label: 'Início', icon: HomeIcon },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'create', label: 'Criar', icon: Palette },
  { id: 'news', label: 'Notícias', icon: Newspaper },
  { id: 'ideas', label: 'Ideias', icon: Lightbulb },
  { id: 'tasks', label: 'Tarefas', icon: ListTodo },
  { id: 'mail', label: 'E-mail', icon: MailIcon },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'business', label: 'Negócio', icon: TrendingUp },
  { id: 'projects', label: 'Projetos', icon: FolderGit2 },
  { id: 'recursos', label: 'Recursos', icon: Sparkles },
  { id: 'team', label: 'Equipe', icon: Users, adminOnly: true },
]

const TITLES: Record<Tab, string> = {
  home: 'Central',
  chat: 'Chat',
  create: 'Criar',
  news: 'Notícias',
  ideas: 'Ideias',
  tasks: 'Tarefas',
  mail: 'E-mail',
  agenda: 'Agenda',
  business: 'Negócio',
  projects: 'Projetos',
  recursos: 'Recursos',
  team: 'Equipe',
}

// A vista da cidade gerada por IA foi trocada por fotos reais de clima (Wikimedia Commons). Ligue de novo para gerar por cidade.
const USE_AI_CITY_VIEW = false

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
  const [pinned, setPinned] = useState<Pin>(loadPinnedScene)
  const brand = useBrand()
  const presenting = usePresenting()
  const [query, setQuery] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)
  const [mailFocus, setMailFocus] = useState<string | null>(null)
  const [voiceTick, setVoiceTick] = useState(0)
  const [skin, setSkin] = useState<SkinId>(loadSkin)

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
  const openVoice = useCallback(() => {
    setTab('chat')
    setVoiceTick((n) => n + 1)
  }, [])
  const openMail = useCallback((id: string | null) => {
    setMailFocus(id)
    setTab('mail')
  }, [])
  const openTarget = useCallback(
    (t: { tab: string; id?: string }) => (t.tab === 'mail' ? openMail(t.id ?? null) : setTab((NAV.some((n) => n.id === t.tab) ? t.tab : 'home') as Tab)),
    [openMail],
  )
  function changeSkin(id: SkinId) {
    setSkin(id)
    applySkin(id)
  }

  async function changeLocation(location: Location) {
    pin(null) // nova cidade: o fundo volta a seguir o clima sozinho
    setSettings((s) => (s ? { ...s, location } : s))
    await putSettings({ location }).catch(() => {})
  }

  function pin(scene: Pin) {
    setPinned(scene)
    savePinnedScene(scene)
  }

  // Cena: o que o usuario fixou > ?scene= na URL > clima atual > hora do dia
  const weatherScene: Scene = sceneFromUrl() ?? weather?.scene ?? sceneByClock()
  const companyScene: Scene = brand.hero_default === 'custom' && brand.has_hero ? 'custom' : brand.hero_default === 'auto' ? weatherScene : 'escritorio'
  const scene: Scene = pinned === 'auto' ? weatherScene : (pinned ?? companyScene)

  // "Minha localizacao" (geolocalizacao do navegador) vira o nome da cidade, que a vista da cidade precisa.
  const locName = settings?.location?.name
  useEffect(() => {
    if (!user || lat == null || lon == null || locName !== 'Minha localização') return
    reverseCity(lat, lon)
      .then((c) => {
        const location: Location = { name: c.name, region: c.region, lat, lon }
        setSettings((s) => (s ? { ...s, location } : s))
        putSettings({ location }).catch(() => {})
      })
      .catch(() => {})
  }, [user, lat, lon, locName])

  // Vista da cidade do usuario no clima de agora: pede pro servidor e acompanha enquanto o Ayran gera.
  const [, setCityImage] = useState<{ scene: Scene; url: string; city: string } | null>(null)
  const [cityState, setCityState] = useState<'idle' | 'generating' | 'ready'>('idle')
  const [cityTick, setCityTick] = useState(0)
  useEffect(() => {
    if (!USE_AI_CITY_VIEW || !user || lat == null || lon == null) {
      setCityImage(null)
      setCityState('idle')
      return
    }
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = async () => {
      try {
        const r = await getCityScene(scene)
        if (!alive) return
        if (r.status === 'ready') {
          setCityImage({ scene, url: BASE + r.url, city: r.city })
          setCityState('ready')
          return
        }
        setCityImage(null) // enquanto nao fica pronta, vale a cena generica
        if (r.status === 'generating') {
          setCityState('generating')
          timer = setTimeout(check, 15_000)
        } else setCityState('idle')
      } catch (e) {
        if (e instanceof AuthError) logout()
      }
    }
    check()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [user, lat, lon, locName, scene, cityTick, logout])

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

  const isAdmin = user.role === 'admin'
  const nav = NAV.filter((n) => !n.adminOnly || isAdmin)
  const { Shell, Home } = SKIN_COMPONENTS[skin]

  return (
    <>
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      {accountOpen && (
        <Account
          user={user}
          onClose={() => setAccountOpen(false)}
          onLogout={() => {
            setAccountOpen(false)
            logout()
          }}
          onAuthError={logout}
        />
      )}
      {presenting && (
        <p className="pointer-events-none fixed bottom-2 left-3 z-20 rounded-full bg-[#0f172ad9] px-3 py-1 text-[10px] text-[#ffffff] backdrop-blur">
          Demonstração com dados fictícios · {brand.site || brand.name}
        </p>
      )}
      <Shell
        scene={scene}
        tab={tab}
        title={TITLES[tab]}
        nav={nav}
        onTab={setTab}
        user={user}
        query={query}
        onQuery={setQuery}
        onSearch={() => {
          if (query.trim()) {
            ask(query.trim())
            setQuery('')
          }
        }}
        bell={<NotificationBell onAuthError={logout} onOpen={openTarget} />}
        picker={<SkinPicker value={skin} onChange={changeSkin} />}
        onAccount={() => setAccountOpen(true)}
        onLogout={logout}
        isLocal={IS_LOCAL}
      >
        {tab === 'home' && (
          <Home
            userName={user.name}
            online={online}
            scene={scene}
            cityName={settings?.location?.name ?? null}
            cityState={cityState}
            onCityChanged={() => setCityTick((t) => t + 1)}
            pinned={pinned}
            onPin={pin}
            weather={weather}
            weatherError={weatherError}
            location={settings?.location ?? null}
            onLocation={changeLocation}
            onAsk={ask}
            onGo={setTab}
            onAuthError={logout}
            isAdmin={isAdmin}
            onVoice={openVoice}
            onOpenMail={openMail}
          />
        )}
        {/* o chat fica montado pra resposta continuar chegando mesmo trocando de tela */}
        <div className={tab === 'chat' ? 'h-full' : 'hidden'}>
          <Chat userName={user.name} pendingPrompt={pendingPrompt} onPromptConsumed={consumed} onAuthError={logout} voiceRequest={voiceTick} />
        </div>
        {tab === 'create' && <Create onAuthError={logout} />}
        {tab === 'news' && <News onAuthError={logout} />}
        {tab === 'ideas' && <Ideas onAuthError={logout} onDevelop={ask} onGo={setTab} />}
        {tab === 'tasks' && <Tasks onAuthError={logout} />}
        {tab === 'mail' && <Mail onAuthError={logout} onAsk={ask} onGo={setTab} focusId={mailFocus} />}
        {tab === 'agenda' && <Agenda onAuthError={logout} />}
        {tab === 'business' && <Business onAuthError={logout} onAsk={ask} onGo={setTab} />}
        {tab === 'projects' && <Projects onAuthError={logout} onAsk={ask} onGo={setTab} isAdmin={isAdmin} />}
        {tab === 'recursos' && <Showcase onGo={setTab} isAdmin={isAdmin} />}
        {tab === 'team' && isAdmin && <Team onAuthError={logout} />}
      </Shell>
    </>
  )
}
