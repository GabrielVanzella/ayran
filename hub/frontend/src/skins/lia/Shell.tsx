import { useEffect, useRef } from 'react'
import { LogOut, Search } from 'lucide-react'
import type { ShellProps } from '../types'

const GRADIENT = 'bg-gradient-to-r from-[#2563eb] via-[#6366f1] to-[#7c3aed]'

/**
 * Interface "Lia": clara e tecnologica. Sem menu lateral: barra de comando no topo (Ctrl/⌘+K) e um dock
 * de navegacao flutuante embaixo. A tela inicial e um mosaico (bento) de blocos.
 */
export default function LiaShell({ tab, title, nav, onTab, user, query, onQuery, onSearch, bell, picker, onAccount, onLogout, children }: ShellProps) {
  const initial = user.name.trim().charAt(0).toUpperCase() || 'A'
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  return (
    <div className="relative h-full overflow-hidden">
      <div className="lia-grid" aria-hidden />
      <div className="relative mx-auto flex h-full max-w-[1500px] flex-col px-3 pt-3 sm:px-6">
        <header className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <span className="lia-core size-8" aria-hidden />
            <span className="leading-none">
              <span className="lia-gradient-text block text-xl font-semibold tracking-tight">Lia</span>
              <span className="lia-mono text-dim">by Ayran</span>
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSearch()
            }}
            className="glass-pill mx-auto flex min-w-0 max-w-2xl flex-1 items-center gap-3 rounded-2xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-indigo-400/40"
          >
            <Search className="size-4 shrink-0 text-dim" />
            <input
              ref={input}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Pergunte, peça ou procure…"
              aria-label="Pergunte ao Ayran"
              name="busca"
              autoComplete="off"
              enterKeyHint="send"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
            />
            <kbd className="lia-mono hidden rounded-md border border-[color:var(--color-line)] px-1.5 py-0.5 text-dim sm:block">Ctrl K</kbd>
          </form>

          {bell}
          {picker}
          <button
            onClick={onAccount}
            title="Minha conta"
            aria-label="Minha conta"
            aria-haspopup="dialog"
            className="glass-pill flex shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-1 text-left transition hover:bg-white/60 sm:pr-4"
          >
            <span className={`grid size-9 place-items-center rounded-full text-sm font-semibold text-[#ffffff] ${GRADIENT}`}>{initial}</span>
            <span className="hidden text-sm leading-tight sm:block">
              {user.name.split(' ')[0]}
              <span className="block text-[11px] text-dim">{user.role === 'admin' ? 'Administrador' : 'Usuário'}</span>
            </span>
          </button>
        </header>

        <main id="conteudo" tabIndex={-1} className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-28 pt-5 outline-none">
          <h1 className="sr-only">Lia — {title}</h1>
          {children}
        </main>

        {/* dock de navegacao flutuante */}
        <nav
          aria-label="Navegação"
          className="glass-pill scroll-thin fixed bottom-3 left-1/2 z-30 flex max-w-[96vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-[28px] p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
        >
          {nav.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => onTab(id)}
                title={label}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-[22px] px-3 py-2.5 text-sm transition ${
                  active ? `${GRADIENT} text-[#ffffff] shadow-lg shadow-indigo-500/30` : 'text-dim hover:bg-white/70 hover:text-ink'
                }`}
              >
                <Icon className="size-5" />
                {active && <span className="hidden sm:inline">{label}</span>}
              </button>
            )
          })}
          <span className="mx-1 h-6 w-px shrink-0 bg-[color:var(--color-line)]" aria-hidden />
          <button onClick={onLogout} title="Sair" aria-label="Sair" className="grid size-10 shrink-0 place-items-center rounded-full text-dim transition hover:bg-white/70 hover:text-red-300">
            <LogOut className="size-5" />
          </button>
        </nav>
      </div>
    </div>
  )
}
