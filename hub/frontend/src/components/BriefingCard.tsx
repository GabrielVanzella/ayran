import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Square, Volume2 } from 'lucide-react'
import { AuthError, getBriefing, voiceStatus, type Briefing } from '../lib/api'
import { createLocalSpeaker } from '../lib/localvoice'
import type { Speaker } from '../lib/voice'
import { ExampleTag } from './ui'

/** Divide o texto em trechos de ate ~900 caracteres, cortando em fim de frase (o servidor limita cada fala). */
function chunks(text: string, max = 900): string[] {
  const out: string[] = []
  let cur = ''
  for (const part of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    if ((cur + part).length > max && cur) {
      out.push(cur.trim())
      cur = ''
    }
    cur += part
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Mensagem do dia para o gestor: o que andou ontem nos projetos e o que importa hoje, com leitura em voz alta. */
export default function BriefingCard({ onAuthError }: { onAuthError: () => void }) {
  const [b, setB] = useState<Briefing | null>(null)
  const [error, setError] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle')
  const speaker = useRef<Speaker | null>(null)

  const load = useCallback(() => {
    getBriefing()
      .then(setB)
      .catch((e) => (e instanceof AuthError ? onAuthError() : setError('Não consegui montar o resumo agora.')))
  }, [onAuthError])
  useEffect(load, [load])
  useEffect(() => () => speaker.current?.stop(), [])

  async function toggle() {
    if (state !== 'idle') {
      speaker.current?.stop()
      speaker.current = null
      setState('idle')
      return
    }
    if (!b) return
    setState('loading')
    try {
      const st = await voiceStatus()
      let voice = st.default ?? ''
      try {
        const saved = localStorage.getItem('ayran.voice')
        if (saved && st.voices.some((v) => v.id === saved)) voice = saved
      } catch {
        /* usa a voz padrao */
      }
      if (!st.tts || !voice) throw new Error('sem voz')
      const sp = createLocalSpeaker(voice, 1.0, () => {
        if (speaker.current === sp) {
          speaker.current = null
          setState('idle')
        }
      })
      speaker.current = sp
      chunks(b.speak).forEach((c) => sp.enqueue(c))
      sp.finish()
      setState('playing')
    } catch (e) {
      setState('idle')
      if (e instanceof AuthError) onAuthError()
      else setError('A voz do servidor não está disponível agora.')
    }
  }

  return (
    <section className="glass rounded-[28px] p-5 sm:p-6" aria-label="Resumo do dia">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-dim">Resumo do dia</p>
          <h2 className="text-2xl font-semibold sm:text-3xl">{b?.greeting ?? 'Montando o seu resumo…'}</h2>
        </div>
        <button
          onClick={toggle}
          disabled={!b}
          aria-pressed={state === 'playing'}
          className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-void transition hover:bg-white/90 disabled:opacity-40"
        >
          {state === 'loading' ? <Loader2 className="size-4 animate-spin" /> : state === 'playing' ? <Square className="size-4" /> : <Volume2 className="size-4" />}
          {state === 'playing' ? 'Parar' : state === 'loading' ? 'Preparando a voz…' : 'Ouvir o resumo'}
        </button>
      </header>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {b && (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          {b.sections.map((s) => (
            <div key={s.id}>
              <h3 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium">
                {s.title} {s.source === 'exemplo' && <ExampleTag text="Exemplo" />}
              </h3>
              <ul className="space-y-2.5">
                {s.items.map((i) => (
                  <li key={i.text} className="text-sm leading-snug">
                    <span className={i.tone === 'bad' ? 'text-red-300' : i.tone === 'warn' ? 'text-amber-200' : ''}>{i.text}</span>
                    {typeof i.progress === 'number' && (
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${i.progress}% concluído`}>
                          <span className="block h-full rounded-full bg-white/75" style={{ width: `${i.progress}%` }} />
                        </span>
                        <span className="text-[11px] tabular-nums text-dim">
                          {i.progress}% · {i.delta}
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-dim">Em breve: receber este resumo todo dia às 8h, por WhatsApp ou e-mail.</p>
    </section>
  )
}
