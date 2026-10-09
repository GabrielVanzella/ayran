import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Orb from './Orb'
import { signin, type User } from '../lib/api'

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      onLogin(await signin(email, password))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-grid flex min-h-full items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="glass w-full max-w-sm rounded-3xl p-8">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <Orb size={72} />
          <div>
            <h1 className="glow-text text-3xl font-bold tracking-[0.3em] text-neon-soft">AYRAN</h1>
            <p className="mt-1 text-sm text-dim">Central da sua IA</p>
          </div>
        </div>
        <label className="mb-1 block text-xs uppercase tracking-wider text-dim">E-mail</label>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-xl border border-line bg-void/60 px-4 py-3 outline-none focus:border-neon/60"
        />
        <label className="mb-1 block text-xs uppercase tracking-wider text-dim">Senha</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6 w-full rounded-xl border border-line bg-void/60 px-4 py-3 outline-none focus:border-neon/60"
        />
        {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <button
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neon px-4 py-3 font-semibold text-void transition hover:bg-neon-soft disabled:opacity-60"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          Entrar
        </button>
        <p className="mt-6 text-center text-xs text-dim">Mesma conta do painel do Ayran (Open WebUI).</p>
      </form>
    </div>
  )
}
