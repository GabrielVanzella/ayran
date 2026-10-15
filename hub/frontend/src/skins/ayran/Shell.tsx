import { LogOut, Search, Settings2 } from 'lucide-react'
import Backdrop from '../../components/Backdrop'
import Orb from '../../components/Orb'
import BrandMark from '../../components/BrandMark'
import type { ShellProps } from '../types'

/** Interface "Ayran": escura e imersiva. Foto de clima em tela cheia, menu lateral em capsula. */
export default function AyranShell({ scene, tab, title, nav, onTab, user, query, onQuery, onSearch, bell, picker, onAccount, onLogout, isLocal, children }: ShellProps) {
  const initial = user.name.trim().charAt(0).toUpperCase() || 'A'
  return (
    <div data-scene={scene} className="relative h-full overflow-hidden">
      <Backdrop scene={scene} soft={tab !== 'home'} />

      <div className="relative mx-auto flex h-full max-w-[1600px] p-2 sm:p-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 px-2 pt-1 sm:gap-4 sm:px-3">
            <div className="flex items-center gap-2.5">
              <Orb size={30} />
              <span className="hidden text-lg font-semibold tracking-wide sm:inline">Ayran</span>
              <span className="mx-1 hidden h-6 w-px bg-white/25 lg:block" aria-hidden />
              <BrandMark className="hidden text-white/85 lg:block" height={24} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                onSearch()
              }}
              className="glass-pill mx-auto flex min-w-0 max-w-xl flex-1 items-center gap-2 rounded-full px-4 py-2 focus-within:border-white/40"
            >
              <Search className="size-4 shrink-0 text-dim" />
              <input
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Pergunte algo ao Ayran…"
                aria-label="Pergunte algo ao Ayran"
                name="busca"
                autoComplete="off"
                enterKeyHint="send"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
              />
            </form>

            {bell}
            {picker}
            <button
              onClick={onAccount}
              title="Minha conta"
              aria-label="Minha conta"
              aria-haspopup="dialog"
              className="glass-pill flex shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-1 text-left transition hover:bg-white/10 sm:pr-4"
            >
              <span className="grid size-8 place-items-center rounded-full bg-white text-sm font-semibold text-void">{initial}</span>
              <span className="hidden text-sm leading-tight sm:block">
                {user.name.split(' ')[0]}
                <span className="block text-[11px] text-dim">{user.role === 'admin' ? 'Administrador' : 'Usuário'}</span>
              </span>
            </button>
          </header>

          <div className="flex min-h-0 flex-1 gap-2 pt-4 sm:gap-5">
            <nav className="hidden shrink-0 flex-col items-center justify-between py-1 md:flex" aria-label="Navegação">
              <div className="glass-pill scroll-thin flex min-h-0 flex-col gap-2 overflow-y-auto rounded-full p-2">
                {nav.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => onTab(id)}
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
                {isLocal && (
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
                  onClick={onLogout}
                  title="Sair"
                  aria-label="Sair"
                  className="grid size-11 place-items-center rounded-full text-dim transition hover:bg-white/10 hover:text-red-300"
                >
                  <LogOut className="size-5" />
                </button>
              </div>
            </nav>

            <main id="conteudo" tabIndex={-1} className="scroll-thin min-h-0 min-w-0 flex-1 overflow-y-auto px-1 pb-3 outline-none sm:px-2">
              <h1 className="sr-only">Ayran — {title}</h1>
              {children}
            </main>
          </div>

          <nav className="glass-pill scroll-thin mt-2 flex overflow-x-auto rounded-3xl pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Navegação">
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`flex min-w-16 flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${tab === id ? 'text-white' : 'text-dim'}`}
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
