import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import Markdown from './Markdown'
import Orb from './Orb'
import { AuthError, getNews, getNewsTopics, streamChat, timeAgo, type NewsItem } from '../lib/api'

export default function News({ onAuthError }: { onAuthError: () => void }) {
  const [topics, setTopics] = useState<{ id: string; label: string }[]>([])
  const [topic, setTopic] = useState('all')
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getNews(topic)
      .then(setItems)
      .catch((e) => e instanceof AuthError && onAuthError())
      .finally(() => setLoading(false))
  }, [topic, onAuthError])

  useEffect(() => {
    getNewsTopics().then(setTopics).catch(() => {})
  }, [])
  useEffect(load, [load])

  async function summarize() {
    if (!items.length || summarizing) return
    setSummarizing(true)
    setSummary('')
    const headlines = items
      .slice(0, 15)
      .map((n) => `- ${n.title} (${n.source})`)
      .join('\n')
    try {
      await streamChat(
        [
          {
            role: 'user',
            content:
              'Faça um briefing curto (em tópicos, no máximo 8) das principais notícias abaixo, agrupando por assunto ' +
              'e destacando o que importa para o dono de uma software house. Só use as manchetes dadas, sem inventar ' +
              `detalhes.\n\n${headlines}`,
          },
        ],
        setSummary,
      )
    } catch (e) {
      if (e instanceof AuthError) onAuthError()
      else setSummary('Não consegui resumir agora.')
    } finally {
      setSummarizing(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {[{ id: 'all', label: 'Tudo' }, ...topics].map((t) => (
          <button
            key={t.id}
            onClick={() => setTopic(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              topic === t.id ? 'bg-neon text-void' : 'border border-line text-dim hover:border-neon/40 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button
            onClick={load}
            className="rounded-full border border-line p-2 text-dim hover:text-ink"
            aria-label="Atualizar"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={summarize}
            disabled={summarizing || !items.length}
            className="flex items-center gap-2 rounded-full bg-violet/80 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-violet disabled:opacity-50"
          >
            {summarizing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Briefing do Ayran
          </button>
        </div>
      </div>

      {(summary || summarizing) && (
        <div className="glass flex gap-3 rounded-2xl p-5">
          <Orb size={30} thinking={summarizing} />
          <div className="min-w-0 flex-1">
            <Markdown text={summary.replace(/<think>[\s\S]*?(<\/think>|$)/, '').trim() || '…'} />
          </div>
        </div>
      )}

      {loading && !items.length ? (
        <div className="flex justify-center py-20 text-dim">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((n) => (
            <a
              key={n.link + n.title}
              href={n.link}
              target="_blank"
              rel="noreferrer"
              className="glass group flex flex-col justify-between gap-3 rounded-2xl p-4 transition hover:border-neon/40"
            >
              <p className="font-medium leading-snug group-hover:text-neon-soft">{n.title}</p>
              <div className="flex items-center gap-2 text-xs text-dim">
                <span className="truncate">{n.source}</span>
                <span>·</span>
                <span className="shrink-0">{timeAgo(n.published)}</span>
                <ExternalLink className="ml-auto size-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
              </div>
            </a>
          ))}
          {!items.length && <p className="text-dim">Nenhuma notícia agora.</p>}
        </div>
      )}
    </div>
  )
}
