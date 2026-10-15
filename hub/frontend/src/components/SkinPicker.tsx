import { useEffect, useRef, useState } from 'react'
import { Check, LayoutTemplate } from 'lucide-react'
import { AuthError, resetDemo } from '../lib/api'
import { SKINS, type SkinId } from '../lib/skin'
import { setPresenting, usePresenting } from '../lib/present'

/** Escolha da interface: cada modelo tem estrutura propria (nao e so outra cor). */
export default function SkinPicker({ value, onChange }: { value: SkinId; onChange: (id: SkinId) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const presenting = usePresenting()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', click)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Trocar de interface"
        aria-label="Trocar de interface"
        className="glass-pill grid size-11 shrink-0 place-items-center rounded-full transition hover:bg-white/10"
      >
        <LayoutTemplate className="size-5" />
      </button>
      {open && (
        <div role="dialog" aria-label="Escolher interface" className="glass absolute right-0 top-14 z-40 w-[min(92vw,26rem)] rounded-[28px] p-3 shadow-2xl">
          <h2 className="px-2 pb-2 pt-1 font-medium">Escolha a interface</h2>
          <ul className="space-y-2">
            {SKINS.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    onChange(s.id)
                    setOpen(false)
                  }}
                  aria-pressed={value === s.id}
                  className={`flex w-full items-start gap-3 rounded-3xl border p-3 text-left transition ${value === s.id ? 'border-white/40 bg-white/10' : 'border-white/10 hover:bg-white/5'}`}
                >
                  <Wireframe id={s.id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium">
                      {s.name} {value === s.id && <Check className="size-4" />}
                    </span>
                    <span className="block text-xs text-dim">{s.tagline}</span>
                    <ul className="mt-1.5 space-y-0.5 text-xs text-dim">
                      {s.details.map((d) => (
                        <li key={d}>• {d}</li>
                      ))}
                    </ul>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="px-2 pb-1 pt-3 text-xs text-dim">Os dados são os mesmos; muda o jeito de navegar e de ver. Cada empresa poderá ter o seu modelo.</p>
          <div className="mt-2 rounded-3xl border border-white/10 p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={presenting} onChange={(e) => setPresenting(e.target.checked)} className="mt-1 size-4 accent-indigo-500" />
              <span className="text-sm">
                Modo apresentação
                <span className="block text-xs text-dim">Tela limpa para prints e demonstrações: sem avisos que aparecem sozinhos e sem etiquetas. Um selo informa que os dados são fictícios.</span>
              </span>
            </label>
            <button
              disabled={busy}
              onClick={async () => {
                if (!confirm('Restaurar os dados de exemplo (e-mails, agenda e, se você não tiver nenhuma, tarefas)? O que você criou de verdade é mantido.')) return
                setBusy(true)
                try {
                  await resetDemo()
                  location.reload()
                } catch (e) {
                  setBusy(false)
                  if (e instanceof AuthError) location.reload()
                }
              }}
              className="mt-3 rounded-full bg-white/10 px-4 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
            >
              {busy ? 'Restaurando…' : 'Restaurar dados de exemplo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Miniatura do layout de cada interface. */
function Wireframe({ id }: { id: SkinId }) {
  if (id === 'ayran') {
    return (
      <span className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#1d2733] to-[#4a6b4a]" aria-hidden>
        <span className="absolute left-1 top-1 bottom-1 w-3 rounded-full bg-white/30" />
        <span className="absolute left-6 top-3 h-1.5 w-10 rounded bg-white/70" />
        <span className="absolute left-6 top-6 h-4 w-14 rounded bg-white/50" />
        <span className="absolute bottom-1 left-6 right-1 h-3 rounded bg-white/25" />
      </span>
    )
  }
  return (
    <span className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#e0f2fe] to-[#ede9fe]" aria-hidden>
      <span className="absolute left-1.5 right-1.5 top-1 h-2 rounded bg-white/90" />
      <span className="absolute left-1.5 top-4 h-7 w-14 rounded bg-[#6366f1]/50" />
      <span className="absolute right-1.5 top-4 h-3 w-7 rounded bg-white/90" />
      <span className="absolute right-1.5 top-8 h-3 w-7 rounded bg-white/90" />
      <span className="absolute bottom-1 left-1/2 h-2.5 w-12 -translate-x-1/2 rounded-full bg-[#4f46e5]/70" />
    </span>
  )
}
