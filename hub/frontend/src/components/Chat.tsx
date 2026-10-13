import { useCallback, useEffect, useRef, useState } from 'react'
import { Brain, History, Plus, Send, Square, Trash2, X } from 'lucide-react'
import Orb from './Orb'
import Markdown from './Markdown'
import {
  AuthError,
  deleteChat,
  listChats,
  loadChat,
  saveChat,
  splitThinking,
  streamChat,
  type ChatMsg,
  type ChatSummary,
} from '../lib/api'

type Props = {
  userName: string
  pendingPrompt: string | null
  onPromptConsumed: () => void
  onAuthError: () => void
}

const SUGGESTIONS = [
  'Revise este trecho de código e aponte bugs',
  'Monte um escopo de projeto para um app de delivery',
  'Escreva um e-mail cobrando um cliente com elegância',
  'Me explique a diferença entre RAG e fine-tuning',
]

export default function Chat({ userName, pendingPrompt, onPromptConsumed, onAuthError }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [chatId, setChatId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<ChatSummary[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const refreshHistory = useCallback(() => {
    listChats()
      .then(setHistory)
      .catch((e) => e instanceof AuthError && onAuthError())
  }, [onAuthError])

  useEffect(refreshHistory, [refreshHistory])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  const send = useCallback(
    async (text: string, base: ChatMsg[] = messages, id: string | null = chatId) => {
      const prompt = text.trim()
      if (!prompt || streaming) return
      setError('')
      setInput('')
      const convo: ChatMsg[] = [...base, { role: 'user', content: prompt }]
      setMessages([...convo, { role: 'assistant', content: '' }])
      setStreaming(true)
      const ctrl = new AbortController()
      abortRef.current = ctrl
      let answer = ''
      try {
        // answer acompanha o streaming, pra manter a resposta parcial se o usuario parar
        await streamChat(
          convo,
          (full) => {
            answer = full
            setMessages([...convo, { role: 'assistant', content: full }])
          },
          ctrl.signal,
        )
      } catch (e) {
        if (e instanceof AuthError) return onAuthError()
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setError(e instanceof Error ? e.message : 'Falha ao falar com o Ayran')
        }
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
      const finalMsgs: ChatMsg[] = [...convo, { role: 'assistant', content: answer }]
      setMessages(finalMsgs)
      if (answer) {
        try {
          const title = convo[0].content.replace(/\s+/g, ' ').slice(0, 60)
          const saved = await saveChat(id, title, finalMsgs)
          setChatId(saved)
          refreshHistory()
        } catch {
          /* historico e best-effort */
        }
      }
    },
    [messages, chatId, streaming, onAuthError, refreshHistory],
  )

  // pedido vindo de outra tela (inicio, ideias, noticias): abre conversa nova
  useEffect(() => {
    if (pendingPrompt && !streaming) {
      setChatId(null)
      send(pendingPrompt, [], null)
      onPromptConsumed()
    }
  }, [pendingPrompt, streaming, send, onPromptConsumed])

  function newChat() {
    abortRef.current?.abort()
    setMessages([])
    setChatId(null)
    setError('')
    setShowHistory(false)
    inputRef.current?.focus()
  }

  async function openChat(id: string) {
    abortRef.current?.abort()
    setShowHistory(false)
    try {
      setMessages(await loadChat(id))
      setChatId(id)
    } catch (e) {
      if (e instanceof AuthError) onAuthError()
    }
  }

  async function removeChat(id: string) {
    await deleteChat(id).catch(() => {})
    if (id === chatId) newChat()
    refreshHistory()
  }

  const historyPanel = (
    <div className="flex h-full flex-col">
      <button
        onClick={newChat}
        className="mb-3 flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-medium text-neon-soft transition hover:bg-neon/20"
      >
        <Plus className="size-4" /> Nova conversa
      </button>
      <div className="scroll-thin -mr-2 flex-1 space-y-1 overflow-y-auto pr-2">
        {history.length === 0 && <p className="px-2 text-xs text-dim">Nenhuma conversa ainda.</p>}
        {history.map((c) => (
          <div
            key={c.id}
            className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              c.id === chatId ? 'bg-neon/10 text-neon-soft' : 'text-dim hover:bg-white/5 hover:text-ink'
            }`}
          >
            <button onClick={() => openChat(c.id)} className="flex-1 truncate text-left">
              {c.title || 'Sem título'}
            </button>
            <button
              onClick={() => removeChat(c.id)}
              className="opacity-0 transition group-hover:opacity-100"
              aria-label="Apagar conversa"
            >
              <Trash2 className="size-3.5 text-dim hover:text-red-300" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex h-full gap-4">
      <aside className="glass hidden w-64 shrink-0 rounded-[28px] p-3 lg:block">{historyPanel}</aside>

      {showHistory && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setShowHistory(false)}>
          <div className="glass absolute inset-y-0 left-0 w-72 p-3" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowHistory(false)} className="mb-2 ml-auto block text-dim" aria-label="Fechar">
              <X className="size-5" />
            </button>
            {historyPanel}
          </div>
        </div>
      )}

      <section className="glass flex min-w-0 flex-1 flex-col rounded-[28px]">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <button onClick={() => setShowHistory(true)} className="text-dim lg:hidden" aria-label="Histórico">
            <History className="size-5" />
          </button>
          <Orb size={26} thinking={streaming} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Ayran</p>
            <p className="truncate text-xs text-dim">
              {streaming ? 'pensando…' : 'escolhe sozinho o especialista: conversa, raciocínio ou código'}
            </p>
          </div>
          <button onClick={newChat} className="rounded-lg p-2 text-dim hover:bg-white/5 hover:text-ink" aria-label="Nova conversa">
            <Plus className="size-5" />
          </button>
        </header>

        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
              <Orb size={84} />
              <h2 className="mt-6 text-2xl font-semibold">E aí, {userName.split(' ')[0]}. Bora?</h2>
              <p className="mt-2 text-dim">Código, empresa, ideias — manda que eu resolvo.</p>
              <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-2xl border border-line bg-white/[0.05] px-4 py-3 text-left text-sm text-dim transition hover:border-neon/40 hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((m, i) => (
                <Message key={i} msg={m} live={streaming && i === messages.length - 1} />
              ))}
              {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="border-t border-line p-3 sm:p-4"
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-line bg-white/[0.06] p-2 focus-within:border-neon/50">
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder="Fale com o Ayran…  (Shift+Enter quebra linha)"
              className="scroll-thin max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none placeholder:text-dim/70"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="rounded-full bg-white/10 p-2.5 text-ink hover:bg-white/20"
                aria-label="Parar"
              >
                <Square className="size-4" />
              </button>
            ) : (
              <button
                disabled={!input.trim()}
                className="rounded-full bg-neon p-2.5 text-void transition hover:bg-neon-soft disabled:opacity-30"
                aria-label="Enviar"
              >
                <Send className="size-4" />
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  )
}

function Message({ msg, live }: { msg: ChatMsg; live: boolean }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-neon/12 px-4 py-3 ring-1 ring-neon/25">
          {msg.content}
        </div>
      </div>
    )
  }
  const { thinking, answer, thinkingOpen } = splitThinking(msg.content)
  return (
    <div className="flex gap-3">
      <Orb size={28} thinking={live} />
      <div className="min-w-0 flex-1">
        {thinking && (
          <details open={thinkingOpen} className="mb-2 rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 text-dim">
              <Brain className="size-4" /> {thinkingOpen ? 'Raciocinando…' : 'Raciocínio'}
            </summary>
            <div className="mt-2 whitespace-pre-wrap text-dim">{thinking}</div>
          </details>
        )}
        {answer ? (
          <Markdown text={answer} />
        ) : (
          live && !thinking && <span className="inline-block h-4 w-2 animate-pulse bg-neon" />
        )}
      </div>
    </div>
  )
}
