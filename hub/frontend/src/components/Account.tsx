import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff, Loader2, LogOut, X } from 'lucide-react'
import { AuthError, changePassword, type User } from '../lib/api'

type Props = { user: User; onClose: () => void; onLogout: () => void; onAuthError: () => void }

export default function Account({ user, onClose, onLogout, onAuthError }: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const firstField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstField.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const tooShort = next.length > 0 && next.length < 8
  const mismatch = confirm.length > 0 && confirm !== next
  const valid = current.length > 0 && next.length >= 8 && next.length <= 64 && confirm === next && next !== current

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    setError('')
    setDone(false)
    try {
      await changePassword(current, next)
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      if (err instanceof AuthError) return onAuthError()
      setError(err instanceof Error ? err.message : 'Não consegui trocar a senha')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-full border border-line bg-white/[0.06] px-5 py-2.5 outline-none focus:border-white/40'
  const type = show ? 'text' : 'password'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conta-titulo"
        className="glass max-h-full w-full max-w-md overflow-y-auto rounded-[28px] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-lg font-semibold text-void">
            {user.name.trim().charAt(0).toUpperCase() || 'A'}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="conta-titulo" className="truncate text-lg font-medium">
              {user.name}
            </h2>
            <p className="truncate text-sm text-dim">{user.email}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="self-start text-dim hover:text-ink">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <div className="flex items-center">
            <h3 className="font-medium">Trocar senha</h3>
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="ml-auto flex items-center gap-1.5 text-xs text-dim transition hover:text-ink"
              aria-pressed={show}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {show ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          <label className="block text-sm text-dim">
            Senha atual
            <input
              ref={firstField}
              type={type}
              name="senha-atual"
              autoComplete="current-password"
              spellCheck={false}
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={`${field} mt-1 text-ink`}
            />
          </label>
          <label className="block text-sm text-dim">
            Nova senha
            <input
              type={type}
              name="senha-nova"
              autoComplete="new-password"
              spellCheck={false}
              required
              minLength={8}
              maxLength={64}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-describedby="regra-senha"
              className={`${field} mt-1 text-ink`}
            />
          </label>
          <p id="regra-senha" className={`text-xs ${tooShort ? 'text-red-300' : 'text-dim'}`}>
            Pelo menos 8 caracteres. Misture letras, números e símbolos.
          </p>
          <label className="block text-sm text-dim">
            Repita a nova senha
            <input
              type={type}
              name="senha-confirmacao"
              autoComplete="new-password"
              spellCheck={false}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
              className={`${field} mt-1 text-ink`}
            />
          </label>
          {mismatch && (
            <p role="alert" className="text-xs text-red-300">
              As senhas não são iguais.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
              {error}
            </p>
          )}
          {done && (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">
              <Check className="size-4" /> Senha trocada. Use a nova no próximo acesso.
            </p>
          )}

          <button
            disabled={!valid || saving}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-void transition hover:bg-neon-soft disabled:opacity-40"
          >
            {saving && <Loader2 className="size-4 animate-spin" />} Salvar nova senha
          </button>
        </form>

        <button
          onClick={onLogout}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm text-dim transition hover:bg-white/10 hover:text-red-300"
        >
          <LogOut className="size-4" /> Sair da conta
        </button>
      </div>
    </div>
  )
}
