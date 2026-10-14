import { Mic, PhoneOff, SkipForward } from 'lucide-react'

export type CallState = 'listening' | 'thinking' | 'speaking' | 'idle'

type Props = {
  state: CallState
  heard: string
  reply: string
  note: string
  onHangUp: () => void
  onSkip: () => void
  onListen: () => void
  voices: { id: string; name: string }[]
  voice: string
  onVoice: (id: string) => void
}

const LABEL: Record<CallState, string> = {
  listening: 'Ouvindo…',
  thinking: 'Pensando…',
  speaking: 'Falando…',
  idle: 'Toque no microfone para falar',
}

/** Tela de conversa por voz: so a esfera, o que voce disse e o que o Ayran esta dizendo. */
export default function VoiceCall({ state, heard, reply, note, onHangUp, onSkip, onListen, voices, voice, onVoice }: Props) {
  return (
    <div role="dialog" aria-label="Conversa por voz" className="fixed inset-0 z-50 flex flex-col items-center bg-black/85 px-6 py-10 backdrop-blur-xl">
      <div className="flex w-full max-w-xl items-center justify-between gap-3 text-sm text-white/60">
        <p>Conversa com o Ayran</p>
        {voices.length > 1 && (
          <label className="flex items-center gap-2">
            <span>Voz</span>
            <select
              value={voice}
              onChange={(e) => onVoice(e.target.value)}
              className="rounded-full border border-white/20 bg-black/40 px-3 py-1 text-white outline-none"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <button
          onClick={state === 'speaking' ? onSkip : state === 'idle' ? onListen : undefined}
          aria-label={LABEL[state]}
          className="relative grid place-items-center"
        >
          <span
            className={`absolute rounded-full bg-white/10 transition-all duration-700 ${
              state === 'listening' ? 'size-72 animate-pulse' : state === 'speaking' ? 'size-64 animate-pulse' : 'size-56'
            }`}
          />
          <div className={`orb rounded-full ${state === 'thinking' || state === 'speaking' ? 'thinking' : ''}`} style={{ width: 168, height: 168 }} />
        </button>

        <p role="status" aria-live="polite" className="text-lg font-medium">
          {LABEL[state]}
        </p>

        <div className="min-h-24 max-w-xl text-center">
          {heard && <p className="text-white/70">“{heard}”</p>}
          {!heard && reply && <p className="line-clamp-4 text-white/90">{reply}</p>}
          {note && <p className="mt-2 text-sm text-amber-200">{note}</p>}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {state === 'speaking' && (
          <button onClick={onSkip} className="flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm hover:bg-white/10">
            <SkipForward className="size-4" /> Interromper
          </button>
        )}
        {state === 'idle' && (
          <button onClick={onListen} className="flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-void">
            <Mic className="size-4" /> Falar
          </button>
        )}
        <button onClick={onHangUp} className="flex items-center gap-2 rounded-full bg-red-500/90 px-5 py-3 text-sm font-medium text-white hover:bg-red-500">
          <PhoneOff className="size-4" /> Encerrar
        </button>
      </div>
    </div>
  )
}
