import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, FolderGit2, GitBranch, GitPullRequest, Github, KeyRound, ListTodo, Plug, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import {
  AuthError,
  addProject,
  agoIso,
  createTask,
  discoverRepos,
  getProject,
  githubTokenStatus,
  listProjects,
  removeProject,
  saveGithubToken,
  type DiscoveredRepo,
  type ProjectOverview,
} from '../lib/api'
import { Empty, ErrorLine, Loading, PageHeader } from './ui'
import { todayISO } from './Tasks'

type Props = { onAuthError: () => void; onAsk: (prompt: string) => void; onGo: (tab: 'tasks') => void; isAdmin: boolean }

const STATUS = {
  ativo: { label: 'Ativo', cls: 'bg-emerald-400/15 text-emerald-200' },
  morno: { label: 'Devagar', cls: 'bg-amber-400/15 text-amber-200' },
  parado: { label: 'Parado', cls: 'bg-red-500/15 text-red-300' },
  'sem-atividade': { label: 'Sem atividade', cls: 'bg-white/10 text-dim' },
} as const

export default function Projects({ onAuthError, onAsk, onGo, isAdmin }: Props) {
  const [projects, setProjects] = useState<ProjectOverview[] | null>(null)
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [failedList, setFailedList] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) return onAuthError()
      setError(e instanceof Error ? e.message : 'Algo deu errado')
    },
    [onAuthError],
  )

  const load = useCallback(
    (fresh = false) => {
      setError('')
      listProjects()
        .then(async (list) => {
          const errs: Record<string, string> = {}
          const out = await Promise.all(
            list.map((p) =>
              getProject(p.id, fresh).catch((e) => {
                if (e instanceof AuthError) onAuthError()
                errs[p.id] = e instanceof Error ? e.message : 'Falha ao ler'
                return null
              }),
            ),
          )
          setFailed(errs)
          setProjects(out.filter((x): x is ProjectOverview => !!x))
          setFailedList(list.filter((p) => errs[p.id]).map((p) => ({ id: p.id, name: p.name })))
        })
        .catch(fail)
    },
    [fail, onAuthError],
  )
  useEffect(() => load(), [load])

  const current = projects?.find((p) => p.id === open) ?? null

  async function remove(p: { id: string; name: string }) {
    if (!confirm(`Desconectar "${p.name}" do Ayran? O repositório em si não é alterado.`)) return
    try {
      await removeProject(p.id)
      setOpen(null)
      setNote(`"${p.name}" desconectado.`)
      load()
    } catch (e) {
      fail(e)
    }
  }

  if (current)
    return (
      <Detail
        p={current}
        isAdmin={isAdmin}
        onBack={() => setOpen(null)}
        onRefresh={() => {
          setProjects(null)
          load(true)
        }}
        onRemove={() => remove(current)}
        onAsk={onAsk}
        onGo={onGo}
        onAuthError={onAuthError}
      />
    )

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Projetos" subtitle="Seus repositórios Git em um só lugar: atividade, quem fez o quê, pull requests e o que está parado. O Ayran só lê, nunca altera o código.">
        {isAdmin && (
          <button
            onClick={() => setConnecting((v) => !v)}
            aria-expanded={connecting}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${connecting ? 'bg-white text-void' : 'bg-white/10 hover:bg-white/20'}`}
          >
            <Plug className="size-4" /> Conectar projeto
          </button>
        )}
        {projects && projects.length > 0 && (
          <button
            onClick={() => {
              setProjects(null)
              load(true)
            }}
            className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10"
          >
            <RefreshCw className="size-4" /> Atualizar
          </button>
        )}
      </PageHeader>

      {note && (
        <p role="status" aria-live="polite" className="glass rounded-full px-5 py-2.5 text-sm">
          {note}
        </p>
      )}
      {error && <ErrorLine message={error} onRetry={() => load()} />}
      {isAdmin && connecting && (
        <Connect
          onAuthError={onAuthError}
          onDone={(msg) => {
            setNote(msg)
            setProjects(null)
            load()
          }}
        />
      )}

      {projects === null ? (
        <Loading text="Lendo os repositórios…" />
      ) : projects.length === 0 && failedList.length === 0 ? (
        <div className="glass rounded-[28px]">
          <Empty title="Nenhum projeto conectado ainda" hint={isAdmin ? 'Conecte um repositório do GitHub ou uma pasta Git do servidor para acompanhar o desenvolvimento.' : 'Peça ao administrador para conectar os repositórios.'}>
            {isAdmin && (
              <button onClick={() => setConnecting(true)} className="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-medium text-void hover:bg-white/90">
                <Plug className="size-4" /> Conectar o primeiro projeto
              </button>
            )}
          </Empty>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <button onClick={() => setOpen(p.id)} className="glass flex h-full w-full flex-col rounded-[28px] p-5 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.08]">
                <div className="flex items-start gap-2">
                  {p.kind === 'github' ? <Github className="mt-0.5 size-4 shrink-0 text-dim" /> : <FolderGit2 className="mt-0.5 size-4 shrink-0 text-dim" />}
                  <h3 className="min-w-0 flex-1 truncate font-medium">{p.name}</h3>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
                </div>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm text-dim">{p.description || (p.kind === 'local' ? 'Repositório local do servidor' : 'Sem descrição')}</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-semibold tabular-nums">{p.commits_7d}</p>
                    <p className="text-xs text-dim">commits em 7 dias</p>
                  </div>
                  <div className="text-right text-xs text-dim">
                    <p>{agoIso(p.last_commit)}</p>
                    <p className="mt-1 flex items-center justify-end gap-3">
                      <span className="inline-flex items-center gap-1" title="Pull requests abertos">
                        <GitPullRequest className="size-3.5" /> {p.prs.length}
                      </span>
                      {p.language && <span>{p.language}</span>}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
          {failedList.map((f) => (
            <li key={f.id} className="glass rounded-[28px] p-5">
              <h3 className="font-medium">{f.name}</h3>
              <p className="mt-2 text-sm text-red-300">{failed[f.id]}</p>
              {isAdmin && (
                <button onClick={() => remove(f)} className="mt-3 flex items-center gap-1.5 text-xs text-dim hover:text-red-300">
                  <Trash2 className="size-3.5" /> Desconectar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Detail({
  p,
  isAdmin,
  onBack,
  onRefresh,
  onRemove,
  onAsk,
  onGo,
  onAuthError,
}: {
  p: ProjectOverview
  isAdmin: boolean
  onBack: () => void
  onRefresh: () => void
  onRemove: () => void
  onAsk: (prompt: string) => void
  onGo: (tab: 'tasks') => void
  onAuthError: () => void
}) {
  const [note, setNote] = useState('')
  const maxAuthor = Math.max(1, ...p.authors_7d.map((a) => a.commits))

  async function prTask(n: number, title: string) {
    try {
      await createTask({ title: `Revisar PR #${n} (${p.name}): ${title}`.slice(0, 160), details: `Projeto ${p.name}`, due_date: todayISO() })
      setNote(`Tarefa criada para o PR #${n}.`)
    } catch (e) {
      if (e instanceof AuthError) onAuthError()
    }
  }

  const summarize = () =>
    onAsk(
      `Faça um resumo executivo, em português e em poucas linhas, do andamento do projeto "${p.name}" com base nos últimos commits abaixo. Destaque o que foi entregue, quem trabalhou e algum risco.\n\n` +
        p.recent.map((c) => `- ${c.date?.slice(0, 10) ?? ''} ${c.author}: ${c.message}`).join('\n'),
    )

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-dim hover:text-ink">
        <ArrowLeft className="size-4" /> Todos os projetos
      </button>
      <PageHeader title={p.name} tag={<span className={`rounded-full px-3 py-1 text-xs font-normal ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>} subtitle={p.description || p.ref}>
        <button onClick={summarize} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-void hover:bg-white/90">
          <Sparkles className="size-4" /> Resumir com o Ayran
        </button>
        <button onClick={onRefresh} className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10">
          <RefreshCw className="size-4" /> Atualizar
        </button>
        {p.url && (
          <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10">
            <ExternalLink className="size-4" /> Abrir no GitHub
          </a>
        )}
      </PageHeader>

      {note && (
        <p role="status" aria-live="polite" className="glass flex items-center gap-3 rounded-full px-5 py-2.5 text-sm">
          {note}
          <button onClick={() => onGo('tasks')} className="ml-auto text-xs underline underline-offset-4 hover:text-white">
            Ver tarefas
          </button>
        </p>
      )}

      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Números do projeto">
        {[
          ['Commits (7 dias)', String(p.commits_7d)],
          ['Commits (30 dias)', p.commits_30d >= 100 ? '100+' : String(p.commits_30d)],
          ['Último commit', agoIso(p.last_commit)],
          [p.kind === 'local' ? 'Alterações não salvas' : 'Pull requests abertos', p.kind === 'local' ? String(p.uncommitted ?? 0) : String(p.prs.length)],
        ].map(([k, v]) => (
          <li key={k} className="glass rounded-[28px] p-5">
            <p className="text-sm text-dim">{k}</p>
            <p className="mt-1 text-2xl font-semibold">{v}</p>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="glass rounded-[28px] p-5 lg:col-span-2" aria-label="Últimos commits">
          <h3 className="mb-3 flex items-center gap-2 font-medium">
            <GitBranch className="size-4 text-dim" /> Últimos commits {p.branch && <span className="text-xs font-normal text-dim">· {p.branch}</span>}
          </h3>
          {p.recent.length === 0 ? (
            <Empty title="Nenhum commit nos últimos 30 dias" />
          ) : (
            <ul className="divide-y divide-[color:var(--color-line)]">
              {p.recent.map((c) => (
                <li key={c.sha + c.date} className="flex items-start gap-3 py-2.5">
                  <code className="mt-0.5 shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px]">{c.sha}</code>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug">{c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">{c.message}</a> : c.message}</span>
                    <span className="text-xs text-dim">
                      {c.author} · {agoIso(c.date)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section className="glass rounded-[28px] p-5" aria-label="Atividade por pessoa">
            <h3 className="mb-3 font-medium">Quem trabalhou (7 dias)</h3>
            {p.authors_7d.length === 0 ? (
              <p className="text-sm text-dim">Sem commits na semana.</p>
            ) : (
              <ul className="space-y-3">
                {p.authors_7d.map((a) => (
                  <li key={a.name}>
                    <p className="flex justify-between text-sm">
                      <span className="truncate">{a.name}</span>
                      <span className="tabular-nums text-dim">{a.commits}</span>
                    </p>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${a.name}: ${a.commits} commits`}>
                      <span className="block h-full rounded-full bg-white/75" style={{ width: `${(a.commits / maxAuthor) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {p.kind === 'github' && (
            <section className="glass rounded-[28px] p-5" aria-label="Pull requests abertos">
              <h3 className="mb-3 flex items-center gap-2 font-medium">
                <GitPullRequest className="size-4 text-dim" /> Pull requests abertos
              </h3>
              {p.prs.length === 0 ? (
                <p className="text-sm text-dim">Nenhum PR aberto.{p.open_issues ? ` ${p.open_issues} issues abertas.` : ''}</p>
              ) : (
                <ul className="space-y-3">
                  {p.prs.map((pr) => (
                    <li key={pr.number} className="text-sm">
                      <a href={pr.url ?? undefined} target="_blank" rel="noreferrer" className="leading-snug hover:underline">
                        #{pr.number} {pr.title}
                      </a>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-dim">
                        {pr.author} · {pr.age_days === 0 ? 'hoje' : `${pr.age_days} d`}
                        <button onClick={() => prTask(pr.number, pr.title)} className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 hover:bg-white/20">
                          <ListTodo className="size-3" /> Criar tarefa
                        </button>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {isAdmin && (
        <button onClick={onRemove} className="flex items-center gap-2 text-sm text-dim hover:text-red-300">
          <Trash2 className="size-4" /> Desconectar este projeto
        </button>
      )}
    </div>
  )
}

function Connect({ onDone, onAuthError }: { onDone: (msg: string) => void; onAuthError: () => void }) {
  const [mode, setMode] = useState<'github' | 'local'>('github')
  const [owner, setOwner] = useState('')
  const [repos, setRepos] = useState<DiscoveredRepo[] | null>(null)
  const [manual, setManual] = useState('')
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState('')
  const [tokenOn, setTokenOn] = useState<boolean | null>(null)

  useEffect(() => {
    githubTokenStatus()
      .then((s) => setTokenOn(s.configured))
      .catch(() => {})
  }, [])

  const fail = (e: unknown) => {
    if (e instanceof AuthError) return onAuthError()
    setError(e instanceof Error ? e.message : 'Algo deu errado')
  }
  async function run<T>(fn: () => Promise<T>) {
    setBusy(true)
    setError('')
    try {
      return await fn()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    if (owner.trim()) run(async () => setRepos(await discoverRepos(owner.trim())))
  }
  const connect = (kind: 'github' | 'local', ref: string, label: string) =>
    run(async () => {
      await addProject({ kind, ref })
      onDone(`"${label}" conectado.`)
      setRepos((r) => r?.map((x) => (x.ref === ref ? { ...x, connected: true } : x)) ?? null)
    })

  return (
    <section className="glass space-y-4 rounded-[28px] p-5" aria-label="Conectar projeto">
      <div className="flex gap-2" role="tablist" aria-label="Tipo de projeto">
        {(['github', 'local'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-full px-4 py-1.5 text-sm ${mode === m ? 'bg-white text-void' : 'border border-white/20 text-dim hover:text-ink'}`}>
            {m === 'github' ? 'GitHub' : 'Pasta no servidor'}
          </button>
        ))}
      </div>

      {mode === 'github' ? (
        <div className="space-y-4">
          <form onSubmit={search} className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <label htmlFor="gh-owner" className="mb-1 block text-xs text-dim">Usuário ou organização do GitHub</label>
              <input id="gh-owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="ex.: gabrielvanzella1" className="field" autoComplete="off" />
            </div>
            <button disabled={busy || !owner.trim()} className="rounded-full bg-white px-5 py-2 text-sm font-medium text-void hover:bg-white/90 disabled:opacity-40">
              Buscar repositórios
            </button>
          </form>
          {repos && (
            <ul className="scroll-thin max-h-72 space-y-1 overflow-y-auto">
              {repos.length === 0 && <li className="py-4 text-center text-sm text-dim">Nenhum repositório encontrado.</li>}
              {repos.map((r) => (
                <li key={r.ref} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {r.name} {r.private && <span className="text-xs font-normal text-dim">(privado)</span>}
                    </span>
                    <span className="block truncate text-xs text-dim">{r.description || 'Sem descrição'}{r.language ? ` · ${r.language}` : ''}</span>
                  </span>
                  <button disabled={busy || r.connected} onClick={() => connect('github', r.ref, r.name)} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20 disabled:opacity-50">
                    {r.connected ? 'Conectado' : 'Conectar'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (manual.trim()) connect('github', manual.trim(), manual.trim())
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="min-w-56 flex-1">
              <label htmlFor="gh-manual" className="mb-1 block text-xs text-dim">Ou informe um repositório (dono/nome ou link)</label>
              <input id="gh-manual" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="GabrielVanzella/ayran" className="field" autoComplete="off" />
            </div>
            <button disabled={busy || !manual.trim()} className="rounded-full bg-white/10 px-5 py-2 text-sm hover:bg-white/20 disabled:opacity-40">
              Conectar
            </button>
          </form>

          <details className="rounded-2xl border border-white/10 p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-sm">
              <KeyRound className="size-4 text-dim" /> Token do GitHub (opcional) {tokenOn && <span className="text-xs text-emerald-300">· configurado</span>}
            </summary>
            <p className="mt-2 text-xs text-dim">
              Necessário só para repositórios privados e para aumentar o limite de consultas. Crie um token de acesso <strong>somente leitura</strong> no GitHub. Ele fica guardado no servidor, fora do código, e nunca é exibido de novo.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                run(async () => {
                  const r = await saveGithubToken(token.trim())
                  setTokenOn(r.configured)
                  setToken('')
                })
              }}
              className="mt-2 flex flex-wrap items-center gap-2"
            >
              <label htmlFor="gh-token" className="sr-only">Token do GitHub</label>
              <input id="gh-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_… ou github_pat_…" autoComplete="off" className="field max-w-sm flex-1" />
              <button disabled={busy} className="rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-40">
                {token.trim() ? 'Salvar token' : tokenOn ? 'Remover token' : 'Salvar'}
              </button>
            </form>
          </details>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (path.trim()) connect('local', path.trim(), path.trim())
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-72 flex-1">
            <label htmlFor="loc-path" className="mb-1 block text-xs text-dim">Caminho completo da pasta no servidor</label>
            <input id="loc-path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="C:\Users\Gabriel\Desktop\projetos\meu-projeto" className="field" autoComplete="off" />
          </div>
          <button disabled={busy || !path.trim()} className="rounded-full bg-white px-5 py-2 text-sm font-medium text-void hover:bg-white/90 disabled:opacity-40">
            Conectar pasta
          </button>
        </form>
      )}
      {error && <ErrorLine message={error} />}
    </section>
  )
}
