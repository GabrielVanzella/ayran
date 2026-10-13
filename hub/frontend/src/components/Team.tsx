import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Loader2, Plus, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import {
  AuthError,
  BASE,
  createTeamUser,
  deleteTeamUser,
  generatePassword,
  listTeam,
  updateTeamUser,
  type TeamUser,
} from '../lib/api'

// Endereço publicado (Cloudflare Worker -> túnel -> este servidor)
const PUBLIC_URL = 'https://vztecnologia.com.br/ayran/'
const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname)

type Access = { name: string; email: string; password: string; kind: 'novo' | 'senha' }

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', user: 'Funcionário', pending: 'Pendente' }

export default function Team({ onAuthError }: { onAuthError: () => void }) {
  const [users, setUsers] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [access, setAccess] = useState<Access | null>(null)

  const refresh = useCallback(() => {
    listTeam()
      .then(setUsers)
      .catch((e) => (e instanceof AuthError ? onAuthError() : setError(e instanceof Error ? e.message : 'Falha ao carregar')))
      .finally(() => setLoading(false))
  }, [onAuthError])

  useEffect(refresh, [refresh])

  const fail = (e: unknown) => {
    if (e instanceof AuthError) return onAuthError()
    setError(e instanceof Error ? e.message : 'Algo deu errado')
  }

  async function resetPassword(u: TeamUser) {
    if (
      !confirm(
        `Gerar uma nova senha para ${u.name}? A senha antiga deixa de funcionar nos próximos logins. ` +
          `Quem já está conectado continua até a sessão vencer (até 4 semanas). Para cortar o acesso na hora, use "Remover acesso".`,
      )
    )
      return
    const password = generatePassword()
    setError('')
    try {
      await updateTeamUser(u.id, { password })
      setAccess({ name: u.name, email: u.email, password, kind: 'senha' })
    } catch (e) {
      fail(e)
    }
  }

  async function toggleRole(u: TeamUser) {
    const next = u.role === 'admin' ? 'user' : 'admin'
    const msg = next === 'admin' ? `Tornar ${u.name} ADMINISTRADOR? Ele passa a ver e gerenciar tudo.` : `Tornar ${u.name} funcionário comum?`
    if (!confirm(msg)) return
    setError('')
    try {
      await updateTeamUser(u.id, { role: next })
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  async function remove(u: TeamUser) {
    if (!confirm(`Remover o acesso de ${u.name}? As conversas dele deixam de ser acessíveis. Isso não tem volta.`)) return
    setError('')
    try {
      await deleteTeamUser(u.id)
      refresh()
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-medium">Equipe</h2>
          <p className="text-sm text-dim">Só você cria acessos. Ninguém consegue se cadastrar sozinho.</p>
        </div>
        <button
          onClick={() => {
            setAdding(true)
            setAccess(null)
          }}
          className="ml-auto flex items-center gap-2 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-void transition hover:bg-neon-soft"
        >
          <UserPlus className="size-4" /> Novo acesso
        </button>
      </header>

      {error && <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

      {access && <AccessCard access={access} onClose={() => setAccess(null)} />}

      {adding && (
        <NewUserForm
          onCancel={() => setAdding(false)}
          onCreated={(a) => {
            setAdding(false)
            setAccess(a)
            refresh()
          }}
          onAuthError={onAuthError}
        />
      )}

      <section className="glass rounded-[28px] p-2">
        {loading ? (
          <div className="grid place-items-center py-12 text-dim">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-white/12 font-medium">
                  {u.name.trim().charAt(0).toUpperCase()}
                  {u.online && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[#101826] bg-emerald-400" title="online agora" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {u.name} {u.me && <span className="text-xs font-normal text-dim">(você)</span>}
                  </p>
                  <p className="truncate text-sm text-dim">{u.email}</p>
                </div>
                <span
                  className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
                    u.role === 'admin' ? 'bg-white text-void' : 'border border-white/20 text-dim'
                  }`}
                >
                  {u.role === 'admin' && <ShieldCheck className="size-3.5" />}
                  {ROLE_LABEL[u.role] ?? u.role}
                </span>
                {!u.me && (
                  <div className="flex gap-1">
                    <IconBtn label="Gerar nova senha" onClick={() => resetPassword(u)}>
                      <KeyRound className="size-4" />
                    </IconBtn>
                    <IconBtn label={u.role === 'admin' ? 'Tornar funcionário' : 'Tornar administrador'} onClick={() => toggleRole(u)}>
                      <ShieldCheck className="size-4" />
                    </IconBtn>
                    <IconBtn label="Remover acesso" danger onClick={() => remove(u)}>
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function IconBtn({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid size-9 place-items-center rounded-full text-dim transition hover:bg-white/10 ${danger ? 'hover:text-red-300' : 'hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function NewUserForm({ onCancel, onCreated, onAuthError }: { onCancel: () => void; onCreated: (a: Access) => void; onAuthError: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(generatePassword)
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createTeamUser({ name: name.trim(), email: email.trim(), password, role })
      onCreated({ name: name.trim(), email: email.trim().toLowerCase(), password, kind: 'novo' })
    } catch (err) {
      if (err instanceof AuthError) return onAuthError()
      setError(err instanceof Error ? err.message : 'Não consegui criar o acesso')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-full border border-line bg-white/[0.06] px-5 py-2.5 outline-none focus:border-white/40'

  return (
    <form onSubmit={submit} className="glass space-y-4 rounded-[28px] p-5">
      <div className="flex items-center">
        <h3 className="font-medium">Novo acesso</h3>
        <button type="button" onClick={onCancel} aria-label="Fechar" className="ml-auto text-dim hover:text-ink">
          <X className="size-5" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-dim">
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Nome do funcionário" className={`${field} mt-1 text-ink`} />
        </label>
        <label className="block text-sm text-dim">
          E-mail
          <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" placeholder="nome@vztecnologia.com.br" className={`${field} mt-1 text-ink`} />
        </label>
        <label className="block text-sm text-dim">
          Senha provisória
          <div className="mt-1 flex gap-2">
            <input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={`${field} font-mono text-ink`} />
            <button type="button" onClick={() => setPassword(generatePassword())} className="shrink-0 rounded-full border border-white/20 px-4 text-xs text-ink transition hover:bg-white/10">
              Gerar outra
            </button>
          </div>
        </label>
        <label className="block text-sm text-dim">
          Papel
          <select value={role} onChange={(e) => setRole(e.target.value as 'user' | 'admin')} className={`${field} mt-1 text-ink`}>
            <option value="user" className="bg-[#101826]">Funcionário</option>
            <option value="admin" className="bg-[#101826]">Administrador (vê e gerencia tudo)</option>
          </select>
        </label>
      </div>
      {error && <p className="rounded-2xl bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full border border-white/20 px-5 py-2.5 text-sm transition hover:bg-white/10">
          Cancelar
        </button>
        <button disabled={saving} className="flex items-center gap-2 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-void transition hover:bg-neon-soft disabled:opacity-60">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Criar acesso
        </button>
      </div>
    </form>
  )
}

/** Mostra o acesso uma unica vez, com a mensagem pronta pra mandar ao funcionario. */
function AccessCard({ access, onClose }: { access: Access; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  // No servidor (localhost) o endereço não serve pra equipe: manda o público.
  const url = IS_LOCAL ? PUBLIC_URL : `${location.origin}${BASE}/`
  const message =
    `Oi ${access.name.split(' ')[0]}! ${access.kind === 'novo' ? 'Seu acesso ao Ayran, a IA da VZ Tecnologia, está pronto' : 'Sua senha do Ayran foi renovada'}:\n\n` +
    `Endereço: ${url}\nE-mail: ${access.email}\nSenha: ${access.password}\n\n` +
    `Entre e, se quiser, peça pra trocar a senha depois.`

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* sem permissao de area de transferencia: o texto continua visivel pra copiar na mao */
    }
  }

  return (
    <section className="glass rounded-[28px] border-white/25 p-5" role="status">
      <div className="flex items-center gap-2">
        <Check className="size-5 text-emerald-400" />
        <h3 className="font-medium">{access.kind === 'novo' ? 'Acesso criado' : 'Nova senha gerada'} para {access.name}</h3>
        <button onClick={onClose} aria-label="Fechar" className="ml-auto text-dim hover:text-ink">
          <X className="size-5" />
        </button>
      </div>
      <p className="mt-1 text-sm text-dim">Copie agora e mande pelo WhatsApp. A senha não aparece de novo.</p>
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 font-mono text-sm">{message}</pre>
      <button onClick={copy} className="mt-3 flex items-center gap-2 rounded-full bg-neon px-5 py-2.5 text-sm font-semibold text-void transition hover:bg-neon-soft">
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copiado' : 'Copiar mensagem'}
      </button>
    </section>
  )
}
