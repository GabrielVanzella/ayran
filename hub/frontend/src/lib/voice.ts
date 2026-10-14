// Voz no navegador: ouvir (SpeechRecognition) e falar (speechSynthesis).
// Nota: no Chrome/Edge o reconhecimento de fala e processado pelo servico do navegador (nuvem).

type RecEvent = { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }
type Rec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

const Ctor = (): (new () => Rec) | undefined => {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const canListen = () => typeof window !== 'undefined' && !!Ctor()
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export type Listener = { stop: () => void }

/** Escuta uma frase. onInterim mostra o texto parcial; onFinal entrega a frase; onEnd roda sempre ao terminar. */
export function listen(h: {
  onInterim: (t: string) => void
  onFinal: (t: string) => void
  onEnd: (reason: 'ok' | 'silence' | 'denied' | 'error') => void
}): Listener {
  const R = Ctor()
  if (!R) {
    h.onEnd('error')
    return { stop() {} }
  }
  const rec = new R()
  rec.lang = 'pt-BR'
  rec.continuous = false
  rec.interimResults = true
  let got = false
  let reason: 'ok' | 'silence' | 'denied' | 'error' = 'silence'
  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      const t = r[0].transcript
      if (r.isFinal) {
        got = true
        reason = 'ok'
        h.onFinal(t.trim())
      } else interim += t
    }
    if (interim) h.onInterim(interim)
  }
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') reason = 'denied'
    else if (e.error !== 'no-speech' && e.error !== 'aborted') reason = 'error'
  }
  rec.onend = () => h.onEnd(got ? 'ok' : reason)
  try {
    rec.start()
  } catch {
    h.onEnd('error')
  }
  return { stop: () => rec.abort() }
}

/** Tira markdown, codigo e links pra a fala soar natural. */
export function cleanForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (trecho de código na tela) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_~>|]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('pt'))
  return (
    vs.find((v) => /natural|neural|online/i.test(v.name) && v.lang === 'pt-BR') ??
    vs.find((v) => v.lang === 'pt-BR') ??
    vs[0]
  )
}

let session = 0

/** Fala o texto em partes (frases). Retorna uma funcao que cancela. onEnd roda no fim ou ao cancelar. */
export function speak(text: string, onEnd: () => void): () => void {
  if (!canSpeak()) {
    onEnd()
    return () => {}
  }
  const mine = ++session
  speechSynthesis.cancel()
  const parts = (text.match(/[^.!?\n]+[.!?]*/g) ?? [text]).map((p) => p.trim()).filter(Boolean)
  let i = 0
  let done = false
  const finish = () => {
    if (done) return
    done = true
    onEnd()
  }
  const next = () => {
    if (mine !== session) return finish()
    if (i >= parts.length) return finish()
    const u = new SpeechSynthesisUtterance(parts[i++])
    u.lang = 'pt-BR'
    const v = pickVoice()
    if (v) u.voice = v
    u.rate = 1.05
    u.onend = next
    u.onerror = () => finish()
    speechSynthesis.speak(u)
  }
  next()
  return () => {
    if (mine === session) session++
    speechSynthesis.cancel()
    finish()
  }
}

export type Speaker = {
  enqueue: (text: string) => void
  /** avisa que nao chegara mais texto; onIdle roda quando a fila esvaziar */
  finish: () => void
  stop: () => void
}

/** Fala uma fila de trechos, um apos o outro, enquanto o texto ainda esta sendo gerado. */
export function createSpeaker(onIdle: () => void): Speaker {
  const queue: string[] = []
  let busy = false
  let finished = false
  let stopped = false
  let idled = false
  const idle = () => {
    if (idled) return
    idled = true
    onIdle()
  }
  const pump = () => {
    if (stopped || busy) return
    const t = queue.shift()
    if (t === undefined) {
      if (finished) idle()
      return
    }
    if (!canSpeak()) return pump()
    busy = true
    const u = new SpeechSynthesisUtterance(t)
    u.lang = 'pt-BR'
    const v = pickVoice()
    if (v) u.voice = v
    u.rate = 1.05
    const done = () => {
      busy = false
      pump()
    }
    u.onend = done
    u.onerror = done
    speechSynthesis.speak(u)
  }
  return {
    enqueue(t) {
      if (stopped) return
      queue.push(t)
      pump()
    },
    finish() {
      finished = true
      pump()
    },
    stop() {
      if (stopped) return
      stopped = true
      queue.length = 0
      if (canSpeak()) speechSynthesis.cancel()
      idle()
    },
  }
}
