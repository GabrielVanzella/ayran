import { useEffect, useState } from 'react'
import { ArrowRight, Code2, Lightbulb, Newspaper, Send, Zap } from 'lucide-react'
import Orb from './Orb'
import { getNews, listIdeas, timeAgo, type Idea, type NewsItem } from '../lib/api'
import type { Tab } from '../App'

type Props = { userName: string; online: boolean; onAsk: (prompt: string) => void; onGo: (tab: Tab) => void }

function greeting(h: number) {
  if (h < 5) return 'Boa madrugada'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const QUICK = [
  { icon: Code2, label: 'Revisar código', prompt: 'Vou colar um código para você revisar. Aponte bugs, riscos e melhorias.' },
  { icon: Zap, label: 'Planejar o dia', prompt: 'Me ajude a organizar minhas prioridades de hoje na empresa. Pergunte o que precisar.' },
  { icon: Lightbulb, label: 'Brainstorm', prompt: 'Vamos fazer um brainstorm de ideias de produto para uma software house.' },
]

export default function Home({ userName, online, onAsk, onGo }: Props) {
  const [now, setNow] = useState(new Date())
  const [news, setNews] = useState<NewsItem[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [ask, setAsk] = useState('')

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    getNews().then((n) => setNews(n.slice(0, 6))).catch(() => {})
    listIdeas().then((i) => setIdeas(i.filter((x) => x.status !== 'feita').slice(0, 4))).catch(() => {})
    return () => clearInterval(t)
  }, [])

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* hero */}
      <section className="glass relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-neon/10 blur-3xl" />
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <Orb size={88} />
          <div className="flex-1">
            <p className="text-sm uppercase tracking-[0.25em] text-dim">
              {now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
              {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
              {greeting(now.getHours())}, <span className="glow-text text-neon-soft">{userName.split(' ')[0]}</span>.
            </h1>
            <p className="mt-1 flex items-center gap-2 text-dim">
              <span className={`size-2 rounded-full ${online ? 'bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400' : 'bg-red-400'}`} />
              {online ? 'Ayran online e pronto.' : 'Ayran offline — verifique o servidor.'}
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (ask.trim()) onAsk(ask.trim())
          }}
          className="mt-6 flex items-center gap-2 rounded-2xl border border-line bg-void/60 p-2 focus-within:border-neon/50"
        >
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Pergunte qualquer coisa ao Ayran…"
            className="flex-1 bg-transparent px-3 py-2 outline-none placeholder:text-dim/70"
          />
          <button className="rounded-xl bg-neon p-2.5 text-void hover:bg-neon-soft" aria-label="Perguntar">
            <Send className="size-4" />
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              onClick={() => onAsk(prompt)}
              className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-dim transition hover:border-neon/40 hover:text-ink"
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card title="Notícias" icon={Newspaper} onMore={() => onGo('news')}>
          {news.length === 0 && <p className="text-sm text-dim">Carregando manchetes…</p>}
          <ul className="divide-y divide-line">
            {news.map((n) => (
              <li key={n.link + n.title}>
                <a href={n.link} target="_blank" rel="noreferrer" className="group block py-2.5">
                  <p className="text-sm leading-snug group-hover:text-neon-soft">{n.title}</p>
                  <p className="mt-0.5 text-xs text-dim">
                    {n.source} · {timeAgo(n.published)}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Ideias em aberto" icon={Lightbulb} onMore={() => onGo('ideas')}>
          {ideas.length === 0 ? (
            <button onClick={() => onGo('ideas')} className="text-sm text-dim hover:text-ink">
              Nenhuma ideia ainda — anote a primeira →
            </button>
          ) : (
            <ul className="space-y-2">
              {ideas.map((i) => (
                <li key={i.id} className="rounded-xl border border-line bg-panel/60 px-3 py-2">
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="text-xs text-dim">{i.status === 'nova' ? 'nova' : 'em andamento'}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Card({
  title,
  icon: Icon,
  onMore,
  children,
}: {
  title: string
  icon: typeof Newspaper
  onMore: () => void
  children: React.ReactNode
}) {
  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-neon" />
        <h2 className="font-semibold">{title}</h2>
        <button onClick={onMore} className="ml-auto flex items-center gap-1 text-xs text-dim hover:text-neon-soft">
          ver tudo <ArrowRight className="size-3" />
        </button>
      </div>
      {children}
    </section>
  )
}
