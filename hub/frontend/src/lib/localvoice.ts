// Voz local: grava o microfone com deteccao de fim de fala e manda ao Whisper; fala com o Piper do servidor.
import { synthesizeSpeech, transcribeAudio } from './api'
import type { Listener, Speaker } from './voice'

export type LocalListenHandlers = {
  onProcessing: () => void
  onFinal: (t: string) => void
  onEnd: (reason: 'ok' | 'silence' | 'denied' | 'error', detail?: string) => void
}

const MAX_MS = 30_000
const WAIT_SPEECH_MS = 9_000
const END_SILENCE_MS = 1_200
const MIN_SPEECH_MS = 250

function pickMime(): string | undefined {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return undefined
}

/** Grava uma frase (comeca quando voce fala, termina apos um silencio) e transcreve no servidor. */
export function listenLocal(h: LocalListenHandlers): Listener {
  let cancelled = false
  let stopRecording: () => void = () => {}
  const abort = new AbortController()

  ;(async () => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch {
      if (!cancelled) h.onEnd('denied')
      return
    }
    if (cancelled) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const chunks: Blob[] = []
    const rec = new MediaRecorder(stream, pickMime() ? { mimeType: pickMime() } : undefined)
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)

    const started = performance.now()
    let floor = 0.008
    let calibrated = false
    let speechAt = 0
    let lastVoice = 0
    let timer = 0
    let discard = false

    const cleanup = () => {
      clearInterval(timer)
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
    }

    const finish = (heardSpeech: boolean) => {
      cleanup()
      discard = !heardSpeech
      if (rec.state !== 'inactive') rec.stop()
      if (!heardSpeech || cancelled) {
        if (!cancelled) h.onEnd('silence')
        return
      }
      h.onProcessing()
    }

    rec.onstop = async () => {
      if (cancelled || discard || !speechAt) return
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
      try {
        const text = (await transcribeAudio(blob, abort.signal)).trim()
        if (cancelled) return
        if (text) {
          h.onFinal(text)
          h.onEnd('ok')
        } else h.onEnd('silence')
      } catch (e) {
        if (!cancelled) h.onEnd('error', e instanceof Error ? e.message : undefined)
      }
    }

    stopRecording = () => {
      cleanup()
      if (rec.state !== 'inactive') rec.stop()
    }

    rec.start(250)
    timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (const v of buf) sum += v * v
      const rms = Math.sqrt(sum / buf.length)
      const now = performance.now()
      if (!calibrated && now - started > 400) {
        calibrated = true
      } else if (!calibrated) {
        floor = Math.max(floor, Math.min(rms, 0.03))
      }
      const threshold = Math.max(0.018, floor * 2.5)
      if (calibrated && rms > threshold) {
        if (!speechAt) speechAt = now
        lastVoice = now
      }
      if (speechAt && now - lastVoice > END_SILENCE_MS) finish(lastVoice - speechAt >= MIN_SPEECH_MS)
      else if (!speechAt && now - started > WAIT_SPEECH_MS) finish(false)
      else if (now - started > MAX_MS) finish(!!speechAt)
    }, 50)
  })()

  return {
    stop() {
      cancelled = true
      abort.abort()
      stopRecording()
    },
  }
}

/** Fila de falas com o Piper: ja busca o audio da proxima frase enquanto a atual toca. */
export function createLocalSpeaker(voice: string, speed: number, onIdle: () => void): Speaker {
  const abort = new AbortController()
  let chain: Promise<void> = Promise.resolve()
  let finished = false
  let stopped = false
  let pending = 0
  let idled = false
  let current: HTMLAudioElement | null = null

  const idle = () => {
    if (idled) return
    idled = true
    onIdle()
  }
  const maybeIdle = () => {
    if (finished && pending === 0 && !stopped) idle()
  }

  return {
    enqueue(text) {
      if (stopped) return
      pending++
      const audio = synthesizeSpeech(text, voice, speed, abort.signal).catch(() => null)
      chain = chain.then(async () => {
        const blob = await audio
        try {
          if (blob && !stopped) {
            const url = URL.createObjectURL(blob)
            const el = new Audio(url)
            current = el
            await new Promise<void>((resolve) => {
              el.onended = el.onerror = () => resolve()
              el.play().catch(() => resolve())
            })
            URL.revokeObjectURL(url)
            current = null
          }
        } finally {
          pending--
          maybeIdle()
        }
      })
    },
    finish() {
      finished = true
      maybeIdle()
    },
    stop() {
      if (stopped) return
      stopped = true
      abort.abort()
      current?.pause()
      current?.dispatchEvent(new Event('ended'))
      idle()
    },
  }
}
