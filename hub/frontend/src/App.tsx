import { useCallback, useEffect, useState } from 'react'
import { Home as HomeIcon, Lightbulb, LogOut, MessageSquare, Music2, Newspaper, Settings2 } from 'lucide-react'
import Login from './components/Login'
import Home from './components/Home'
import Chat from './components/Chat'
import News from './components/News'
import Ideas from './components/Ideas'
import Music from './components/Music'
import Player from './components/Player'
import Orb from './components/Orb'
import { AuthError, getSettings, getToken, health, me, putSettings, setToken, type Settings, type User } from './lib/api'

export type Tab = 'home' | 'chat' | 'news' | 'ideas' | 'music'

const NAV: { id: Tab; label: string; icon: typeof HomeIcon }[] = [
  { id: 'home', label: 'Início', icon: HomeIcon },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'news', label: 'Notícias', icon: Newspaper },
  { id: 'ideas', label: 'Ideias', icon: Lightbulb },
  { id: 'music', label: 'Música', icon: Music2 },
]

const TITLES: Record<Tab, string> = {
  home: 'Central',
  chat: 'Chat',
  news: 'Notícias',
  ideas: 'Ideias',
  music: 'Música',
}

function initialTab(): Tab {
  const h = location.hash.slice(1) as Tab
  return NAV.some((n) => n.id === h) ? h : 'home'
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(!!getToken())
  const [tab, setTabState] = useState<Tab>(initialTab)
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [online, setOnline] = useState(true)

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const setTab = (t: Tab) => {
    setTabState(t)
    history.replaceState(null, '', `#${t}`)
  }

  useEffect(() => {
    if (!getToken()) return
    me()
      .then(setUser)
      .catch(logout)
      .finally(() => setChecking(false))
  }, [logout])

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

  const ask = useCallback((prompt: string) => {
    setPendingPrompt(prompt)
    setTab('chat')
  }, [])
  const consumed = useCallback(() => setPendingPrompt(null), [])

  async function changeMusic(url: string) {
    setSettings((s) => (s ? { ...s, spotify: url } : s))
    await putSettings({ spotify: url }).catch(() => {})
  }

  if (checking) {
    return (
      <div className="bg-grid flex h-full items-center justify-center">
        <Orb size={64} thinking />
      </div>
    )
  }
  if (!user) return <Login onLogin={setUser} />

  return (
    <div className="bg-grid flex h-full">
      {/* barra lateral (desktop) */}
      <nav className="hidden w-20 shrink-0 flex-col items-center gap-2 border-r border-line bg-void/40 py-5 md:flex">
        <Orb size={38} />
        <div className="mt-6 flex flex-1 flex-col gap-2">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              title={label}
              aria-label={label}
              className={`group relative rounded-2xl p-3 transition ${
                tab === id ? 'bg-neon/15 text-neon shadow-[0_0_20px_-4px] shadow-neon/50' : 'text-dim hover:bg-white/5 hover:text-ink'
              }`}
            >
              <Icon className="size-5" />
            </button>
          ))}
        </div>
        <a
          href={`http://${location.hostname}:8080`}
          target="_blank"
          rel="noreferrer"
          title="Painel avançado (Open WebUI) — por enquanto só no próprio servidor" className="rounded-2xl p-3 text-dim hover:bg-white/5 hover:text-ink">
          <Settings2 className="size-5" />
        </a>
        <button onClick={logout} title="Sair" aria-label="Sair" className="rounded-2xl p-3 text-dim hover:bg-white/5 hover:text-red-300">
          <LogOut className="size-5" />
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 px-4 pb-2 pt-4 sm:px-6">
          <div className="md:hidden">
            <Orb size={30} />
          </div>
          <h1 className="text-xl font-semibold tracking-wide">
            <span className="text-dim">AYRAN /</span> {TITLES[tab]}
          </h1>
          <div className="ml-auto flex items-center gap-2 text-sm text-dim">
            <span className="hidden sm:inline">{user.name}</span>
            <button onClick={logout} className="rounded-lg p-2 hover:bg-white/5 md:hidden" aria-label="Sair">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {tab === 'home' && <Home userName={user.name} online={online} onAsk={ask} onGo={setTab} />}
          {/* o chat fica montado pra resposta continuar chegando mesmo trocando de tela */}
          <div className={tab === 'chat' ? 'h-full' : 'hidden'}>
            <Chat userName={user.name} pendingPrompt={pendingPrompt} onPromptConsumed={consumed} onAuthError={logout} />
          </div>
          {tab === 'news' && <News onAuthError={logout} />}
          {tab === 'ideas' && <Ideas onAuthError={logout} onDevelop={ask} />}
          {tab === 'music' && settings && <Music current={settings.spotify} onChange={changeMusic} />}
        </main>

        {settings?.spotify && (
          <div className="px-4 pb-2 sm:px-6">
            <Player url={settings.spotify} />
          </div>
        )}

        {/* navegacao inferior (celular) */}
        <nav className="flex border-t border-line bg-void/80 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${tab === id ? 'text-neon' : 'text-dim'}`}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
