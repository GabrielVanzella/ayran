import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, Sparkles, Trash2 } from 'lucide-react'
import { AuthError, createIdea, deleteIdea, listIdeas, updateIdea, type Idea } from '../lib/api'

const COLUMNS: { id: Idea['status']; label: string; accent: string }[] = [
  { id: 'nova', label: 'Novas', accent: 'bg-neon' },
  { id: 'andamento', label: 'Em andamento', accent: 'bg-violet' },
  { id: 'feita', label: 'Feitas', accent: 'bg-emerald-400' },
]

type Props = { onAuthError: () => void; onDevelop: (prompt: string) => void }

export default function Ideas({ onAuthError, onDevelop }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tag, setTag] = useState('')

  const fail = useCallback((e: unknown) => e instanceof AuthError && onAuthError(), [onAuthError])

  useEffect(() => {
    listIdeas().then(setIdeas).catch(fail)
  }, [fail])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      const idea = await createIdea({ title: title.trim(), body: body.trim(), tag: tag.trim() })
      setIdeas((list) => [idea, ...list])
      setTitle('')
      setBody('')
      setTag('')
    } catch (err) {
      fail(err)
    }
  }

  async function move(idea: Idea, dir: -1 | 1) {
    const idx = COLUMNS.findIndex((c) => c.id === idea.status) + dir
    if (idx < 0 || idx >= COLUMNS.length) return
    const updated = await updateIdea(idea.id, { status: COLUMNS[idx].id }).catch(fail)
    if (updated) setIdeas((list) => list.map((i) => (i.id === idea.id ? updated : i)))
  }

  async function remove(idea: Idea) {
    await deleteIdea(idea.id).catch(fail)
    setIdeas((list) => list.filter((i) => i.id !== idea.id))
  }

  function develop(idea: Idea) {
    onDevelop(
      `Quero desenvolver esta ideia:\n\n**${idea.title}**${idea.body ? `\n${idea.body}` : ''}\n\n` +
        'Me ajude a: 1) refinar a proposta de valor, 2) listar funcionalidades de um MVP, ' +
        '3) sugerir stack técnica e 4) apontar riscos e próximos passos.',
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <form onSubmit={add} className="glass grid gap-2 rounded-2xl p-4 sm:grid-cols-[1fr_2fr_10rem_auto]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nova ideia…"
          className="rounded-xl border border-line bg-void/60 px-3 py-2.5 outline-none focus:border-neon/50"
        />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Detalhes (opcional)"
          className="rounded-xl border border-line bg-void/60 px-3 py-2.5 outline-none focus:border-neon/50"
        />
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Tag (ex: produto)"
          className="rounded-xl border border-line bg-void/60 px-3 py-2.5 outline-none focus:border-neon/50"
        />
        <button className="flex items-center justify-center gap-2 rounded-xl bg-neon px-4 py-2.5 font-semibold text-void hover:bg-neon-soft">
          <Plus className="size-4" /> Adicionar
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col, ci) => {
          const list = ideas.filter((i) => i.status === col.id)
          return (
            <div key={col.id} className="glass rounded-2xl p-3">
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={`size-2 rounded-full ${col.accent}`} />
                <h3 className="font-semibold">{col.label}</h3>
                <span className="ml-auto text-xs text-dim">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.length === 0 && <p className="px-1 py-6 text-center text-xs text-dim">Vazio</p>}
                {list.map((idea) => (
                  <div key={idea.id} className="group rounded-xl border border-line bg-panel/70 p-3">
                    <div className="flex items-start gap-2">
                      <p className="flex-1 font-medium leading-snug">{idea.title}</p>
                      {idea.tag && (
                        <span className="rounded-full bg-neon/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-neon-soft">
                          {idea.tag}
                        </span>
                      )}
                    </div>
                    {idea.body && <p className="mt-1 text-sm text-dim">{idea.body}</p>}
                    <div className="mt-3 flex items-center gap-1">
                      <button
                        onClick={() => develop(idea)}
                        className="flex items-center gap-1 rounded-lg bg-violet/20 px-2 py-1 text-xs text-violet-200 hover:bg-violet/35"
                      >
                        <Sparkles className="size-3.5" /> Desenvolver com Ayran
                      </button>
                      <div className="ml-auto flex gap-1">
                        {ci > 0 && (
                          <IconBtn label="Voltar" onClick={() => move(idea, -1)}>
                            <ArrowLeft className="size-3.5" />
                          </IconBtn>
                        )}
                        {ci < COLUMNS.length - 1 && (
                          <IconBtn label="Avançar" onClick={() => move(idea, 1)}>
                            <ArrowRight className="size-3.5" />
                          </IconBtn>
                        )}
                        <IconBtn label="Apagar" onClick={() => remove(idea)}>
                          <Trash2 className="size-3.5" />
                        </IconBtn>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="rounded-lg p-1.5 text-dim hover:bg-white/5 hover:text-ink">
      {children}
    </button>
  )
}
