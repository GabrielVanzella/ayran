import { FlaskConical, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import type { Verdict } from '../lib/api'

/** Marca o que vem de dados de exemplo: o prototipo nunca finge que e real. */
export function ExampleTag({ text = 'Dados de exemplo' }: { text?: string }) {
  return (
    <span
      title="Esta função usa dados de exemplo: ainda não está conectada a uma conta real."
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[11px] text-amber-100"
    >
      <FlaskConical className="size-3" /> {text}
    </span>
  )
}

const VERDICT = {
  ok: { cls: 'bg-emerald-400/15 text-emerald-200', Icon: ShieldCheck, text: 'Seguro' },
  warn: { cls: 'bg-amber-400/15 text-amber-200', Icon: ShieldQuestion, text: 'Suspeito' },
  bad: { cls: 'bg-red-500/15 text-red-300', Icon: ShieldAlert, text: 'Provável golpe' },
} as const

/** Veredito com texto + icone (nao depende so de cor). */
export function VerdictChip({ verdict, label }: { verdict: Verdict; label?: string }) {
  const { cls, Icon, text } = VERDICT[verdict]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] ${cls}`}>
      <Icon className="size-3" /> {label ?? text}
    </span>
  )
}

export const verdictColor = (v: Verdict) => (v === 'bad' ? 'text-red-300' : v === 'warn' ? 'text-amber-300' : 'text-emerald-300')

export function Loading({ text = 'Carregando…' }: { text?: string }) {
  return (
    <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-dim">
      <Loader2 className="size-4 animate-spin" /> {text}
    </p>
  )
}

export function Empty({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="py-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-dim">{hint}</p>}
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  )
}

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <p role="alert" className="flex items-center gap-3 rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
      {message}
      {onRetry && (
        <button onClick={onRetry} className="ml-auto underline underline-offset-4 hover:text-red-200">
          Tentar de novo
        </button>
      )}
    </p>
  )
}

export function PageHeader({ title, subtitle, tag, children }: { title: string; subtitle?: string; tag?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        <h2 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {title} {tag}
        </h2>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-dim">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}
