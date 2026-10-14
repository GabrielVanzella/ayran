import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, Brain, History, Mic, Plus, Send, Square, Trash2, X } from 'lucide-react'
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
  type VoiceStatus,
  voiceStatus,
} from '../lib/api'
import { canListen, cleanForSpeech, createSpeaker, listen, type Listener, type Speaker } from '../lib/voice'
import { createLocalSpeaker, listenLocal } from '../lib/localvoice'
import VoiceCall, { type CallState } from './VoiceCall'

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

/** fim da ultima frase completa em `text` (depois de `from`), sem cortar bloco de codigo aberto; `from` se nao houver */
function lastBoundary(text: string, from: number): number {
  for (let i = text.length - 2; i >= from; i--) {
    const c = text[i]
    if ((c === '.' || c === '!' || c === '?') && /\s/.test(text[i + 1])) {
      if ((text.slice(0, i + 1).match(/```/g)?.length ?? 0) % 2 === 0) return i + 1
    } else if (c === '\n' && (text.slice(0, i).match(/```/g)?.length ?? 0) % 2 === 0) {
      return i + 1
    }
  }
  return from
}

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

  // ---- voz ----
  const [talk, setTalk] = useState(false) // tela de conversa por voz aberta
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [heard, setHeard] = useState('')
  const [reply, setReply] = useState('')
  const [voiceNote, setVoiceNote] = useState('')
  const talkRef = useRef(false)
  const listenerRef = useRef<Listener | null>(null)
  const speakerRef = useRef<Speaker | null>(null)
  const sendRef = useRef<(t: string, onPartial?: (full: string) => void) => Promise<string>>(async () => '')
  const startListenRef = useRef<() => void>(() => {})
  const silences = useRef(0)
  talkRef.current = talk

  // voz local (Whisper + Piper no servidor); sem ela, cai no reconhecimento do navegador
  const [local, setLocal] = useState<VoiceStatus | null>(null)
  const [processing, setProcessing] = useState(false)
  const [voiceId, setVoiceId] = useState(() => {
    try {
      return localStorage.getItem('ayran.voice') ?? ''
    } catch {
      return ''
    }
  })
  const useLocal = !!local?.stt && !!local?.tts && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  const localRef = useRef(false)
  localRef.current = useLocal
  const voiceRef = useRef('')
  const chosenVoice = local?.voices.some((v) => v.id === voiceId) ? voiceId : (local?.default ?? '')
  voiceRef.current = chosenVoice

  useEffect(() => {
    voiceStatus().then(setLocal).catch(() => setLocal(null))
  }, [])

  function pickVoice(id: string) {
    setVoiceId(id)
    try {
      localStorage.setItem('ayran.voice', id)
    } catch {
      /* preferencia e opcional */
    }
  }

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
    async (
      text: string,
      base: ChatMsg[] = messages,
      id: string | null = chatId,
      onPartial?: (full: string) => void,
    ): Promise<string> => {
      const prompt = text.trim()
      if (!prompt || streaming) return ''
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
            onPartial?.(full)
            setMessages([...convo, { role: 'assistant', content: full }])
          },
          ctrl.signal,
        )
      } catch (e) {
        if (e instanceof AuthError) {
          onAuthError()
          return ''
        }
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
      return answer
    },
    [messages, chatId, streaming, onAuthError, refreshHistory],
  )

  sendRef.current = (t, onPartial) => send(t, messages, chatId, onPartial)

  const stopVoice = useCallback(() => {
    listenerRef.current?.stop()
    listenerRef.current = null
    speakerRef.current?.stop()
    speakerRef.current = null
    setListening(false)
    setSpeaking(false)
    setProcessing(false)
    setHeard('')
  }, [])

  // o Ayran fala frase a frase enquanto a resposta ainda esta sendo escrita
  const converse = useCallback((said: string) => {
    let idx = 0
    const onIdle = () => {
      if (speakerRef.current !== speaker) return
      speakerRef.current = null
      setSpeaking(false)
      if (talkRef.current) startListenRef.current()
    }
    const speaker: Speaker = localRef.current ? createLocalSpeaker(voiceRef.current, 1.0, onIdle) : createSpeaker(onIdle)
    speakerRef.current = speaker
    const feed = (full: string, final: boolean) => {
      const ans = splitThinking(full).answer
      const end = final ? ans.length : lastBoundary(ans, idx)
      if (end <= idx) return
      const chunk = cleanForSpeech(ans.slice(idx, end))
      idx = end
      if (chunk) {
        setSpeaking(true)
        setReply(cleanForSpeech(ans.slice(0, end)))
        speaker.enqueue(chunk)
      }
    }
    setReply('')
    sendRef.current(said, (full) => feed(full, false)).then((a) => {
      feed(a, true)
      speaker.finish()
    })
  }, [])

  startListenRef.current = () => {
    listenerRef.current?.stop()
    setVoiceNote('')
    setListening(true)
    let sent = false
    const handlers = {
      onInterim: setHeard,
      onProcessing: () => {
        setListening(false)
        setProcessing(true)
      },
      onFinal: (t: string) => {
        setProcessing(false)
        if (!t) return
        sent = true
        silences.current = 0
        setHeard(t)
        converse(t)
      },
      onEnd: (reason: 'ok' | 'silence' | 'denied' | 'error', detail?: string) => {
        if (listenerRef.current !== l) return
        listenerRef.current = null
        setListening(false)
        setProcessing(false)
        if (!sent) setHeard('')
        if (sent) return
        if (reason === 'denied') {
          setVoiceNote('O navegador bloqueou o microfone. Libere o acesso no cadeado da barra de endereço.')
        } else if (reason === 'error') {
          setVoiceNote(detail ?? 'Não consegui ouvir agora. Verifique o microfone e toque em Falar.')
        } else if (talkRef.current) {
          // silencio: tenta de novo algumas vezes e depois espera o toque
          if (++silences.current < 4) startListenRef.current()
          else setVoiceNote('Não ouvi nada. Toque em Falar quando quiser continuar.')
        }
      },
    }
    const l: Listener = localRef.current ? listenLocal(handlers) : listen(handlers)
    listenerRef.current = l
  }

  function openCall() {
    abortRef.current?.abort()
    stopVoice()
    silences.current = 0
    setReply('')
    setVoiceNote('')
    setTalk(true)
    talkRef.current = true
    startListenRef.current()
  }

  function hangUp() {
    setTalk(false)
    talkRef.current = false
    stopVoice()
  }

  function dictate() {
    if (listening) return stopVoice()
    stopVoice()
    setVoiceNote('')
    setListening(true)
    const handlers = {
      onInterim: (t: string) => setInput(t),
      onProcessing: () => setProcessing(true),
      onFinal: (t: string) => setInput(t),
      onEnd: (reason: 'ok' | 'silence' | 'denied' | 'error', detail?: string) => {
        if (listenerRef.current !== l) return
        listenerRef.current = null
        setListening(false)
        setProcessing(false)
        if (reason === 'denied') setVoiceNote('O navegador bloqueou o microfone. Libere o acesso no cadeado da barra de endereço.')
        else if (reason === 'error') setVoiceNote(detail ?? 'Não consegui ouvir agora. Verifique o microfone.')
        inputRef.current?.focus()
      },
    }
    const l: Listener = localRef.current ? listenLocal(handlers) : listen(handlers)
    listenerRef.current = l
  }

  useEffect(() => () => stopVoice(), [stopVoice])

  const callState: CallState = streaming || processing ? 'thinking' : speaking ? 'speaking' : listening ? 'listening' : 'idle'

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
    hangUp()
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
      {talk && (
        <VoiceCall
          state={callState}
          heard={heard}
          reply={reply}
          note={voiceNote}
          voices={local?.voices ?? []}
          voice={chosenVoice}
          onVoice={pickVoice}
          onHangUp={hangUp}
          onSkip={() => speakerRef.current?.stop()}
          onListen={() => {
            silences.current = 0
            startListenRef.current()
          }}
        />
      )}
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
          <Orb size={26} thinking={streaming || listening || speaking} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Ayran</p>
            <p className="truncate text-xs text-dim">
              {streaming
                ? 'pensando…'
                : speaking
                  ? 'falando…'
                  : listening
                    ? 'ouvindo…'
                    : 'escolhe sozinho o especialista: conversa, raciocínio ou código'}
            </p>
          </div>
          {canListen() && (
            <button
              onClick={openCall}
              className="flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-void transition hover:bg-white/90"
            >
              <AudioLines className="size-4" /> Falar com o Ayran
            </button>
          )}
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
          {!talk && voiceNote && (
            <p role="status" className="mx-auto mb-2 max-w-3xl px-3 text-xs text-dim">
              {voiceNote}
            </p>
          )}
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
            {canListen() && (
              <button
                type="button"
                onClick={dictate}
                aria-pressed={listening && !talk}
                title="Ditar mensagem (o texto aparece aqui para você revisar)"
                aria-label="Ditar mensagem"
                className={`rounded-full p-2.5 transition ${listening && !talk ? 'animate-pulse bg-red-500/30 text-red-200' : 'text-dim hover:bg-white/10 hover:text-ink'}`}
              >
                <Mic className="size-4" />
              </button>
            )}
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
