import { useCallback, useEffect, useRef, useState } from 'react'
import { Clapperboard, Download, ImageIcon, Loader2, Lock, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import {
  AuthError,
  createImage,
  deleteMedia,
  getMediaCapabilities,
  listMedia,
  mediaFileUrl,
  type MediaCapabilities,
  type MediaJob,
} from '../lib/api'

const SIZE_LABELS: Record<string, string> = { quadrado: 'Quadrado', retrato: 'Retrato', paisagem: 'Paisagem' }
const STYLE_LABELS: Record<string, string> = {
  livre: 'Livre',
  foto: 'Foto realista',
  ilustracao: 'Ilustração',
  anime: 'Anime',
  '3d': '3D',
  conceito: 'Arte conceitual',
}
const STATUS_LABELS: Record<string, string> = { na_fila: 'Na fila', gerando: 'Gerando', pronto: 'Pronto', erro: 'Erro' }

export default function Create({ onAuthError }: { onAuthError: () => void }) {
  const [mode, setMode] = useState<'image' | 'video'>('image')
  const [caps, setCaps] = useState<MediaCapabilities | null>(null)
  const [jobs, setJobs] = useState<MediaJob[]>([])
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('quadrado')
  const [style, setStyle] = useState('livre')
  const [enhance, setEnhance] = useState(true)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [viewing, setViewing] = useState<MediaJob | null>(null)

  const fail = useCallback((e: unknown) => (e instanceof AuthError ? onAuthError() : null), [onAuthError])

  const refresh = useCallback(() => listMedia().then(setJobs).catch(fail), [fail])

  useEffect(() => {
    getMediaCapabilities().then(setCaps).catch(fail)
    refresh()
  }, [refresh, fail])

  // acompanha a fila enquanto houver algo gerando
  const pending = jobs.some((j) => j.status === 'na_fila' || j.status === 'gerando')
  useEffect(() => {
    if (!pending) return
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [pending, refresh])

  async function generate(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || sending) return
    setSending(true)
    setError('')
    try {
      await createImage({ prompt: prompt.trim(), size, style, enhance })
      await refresh()
    } catch (err) {
      fail(err)
      setError(err instanceof Error ? err.message : 'Falha ao pedir a imagem')
    } finally {
      setSending(false)
    }
  }

  async function remove(job: MediaJob) {
    await deleteMedia(job.id).catch(fail)
    setJobs((list) => list.filter((j) => j.id !== job.id))
    if (viewing?.id === job.id) setViewing(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex gap-2">
        <ModeButton active={mode === 'image'} onClick={() => setMode('image')} icon={ImageIcon} label="Imagem" />
        <ModeButton
          active={mode === 'video'}
          onClick={() => setMode('video')}
          icon={Clapperboard}
          label="Vídeo"
          locked={!caps?.video}
        />
        {caps && (
          <span className="ml-auto self-center text-xs text-dim">
            {caps.comfy_online ? `Motor online · GPU ${caps.vram_gb} GB` : 'Motor de imagem offline'}
          </span>
        )}
      </div>

      {mode === 'video' ? (
        <VideoLocked caps={caps} />
      ) : (
        <>
          <form onSubmit={generate} className="glass space-y-4 rounded-2xl p-5">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Descreva a imagem em português… ex: um farol numa ilha durante uma tempestade, ao pôr do sol"
              className="w-full resize-none rounded-xl border border-line bg-void/60 px-4 py-3 outline-none focus:border-neon/50"
            />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Chips label="Formato" options={caps?.sizes ?? ['quadrado']} labels={SIZE_LABELS} value={size} onChange={setSize} />
              <Chips label="Estilo" options={caps?.styles ?? ['livre']} labels={STYLE_LABELS} value={style} onChange={setStyle} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-dim">
                <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} className="accent-cyan-400" />
                <Wand2 className="size-4" /> Ayran melhora o prompt (traduz pro inglês e detalha)
              </label>
              <button
                disabled={sending || !prompt.trim() || !caps?.image}
                className="ml-auto flex items-center gap-2 rounded-xl bg-neon px-5 py-2.5 font-semibold text-void transition hover:bg-neon-soft disabled:opacity-40"
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Gerar imagem
              </button>
            </div>
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
            <p className="text-xs text-dim">
              Neste notebook (GPU de 4 GB) cada imagem leva de ~30s a alguns minutos. Uma por vez — os pedidos entram na
              fila.
            </p>
          </form>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onOpen={() => setViewing(job)} onDelete={() => remove(job)} />
            ))}
            {jobs.length === 0 && <p className="col-span-full py-10 text-center text-dim">Suas imagens aparecem aqui.</p>}
          </div>
        </>
      )}

      {viewing && <Viewer job={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  locked,
}: {
  active: boolean
  onClick: () => void
  icon: typeof ImageIcon
  label: string
  locked?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
        active ? 'bg-neon text-void' : 'border border-line text-dim hover:border-neon/40 hover:text-ink'
      }`}
    >
      <Icon className="size-4" /> {label} {locked && <Lock className="size-3.5" />}
    </button>
  )
}

function Chips({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string
  options: string[]
  labels: Record<string, string>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-dim">{label}</span>
      {options.map((o) => (
        <button
          type="button"
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-full px-3 py-1 text-xs transition ${
            value === o ? 'bg-violet/80 text-white' : 'border border-line text-dim hover:text-ink'
          }`}
        >
          {labels[o] ?? o}
        </button>
      ))}
    </div>
  )
}

/** Imagens precisam do token no header, entao baixa como blob e mostra via object URL. */
function useMediaBlob(job: MediaJob, n = 0) {
  const [url, setUrl] = useState<string | null>(null)
  const ref = useRef<string | null>(null)
  useEffect(() => {
    if (job.status !== 'pronto' || !job.outputs.length) return
    let alive = true
    mediaFileUrl(job.id, n).then((u) => {
      if (alive) {
        ref.current = u
        setUrl(u)
      } else URL.revokeObjectURL(u)
    })
    return () => {
      alive = false
      if (ref.current) URL.revokeObjectURL(ref.current)
    }
  }, [job.id, job.status, job.outputs.length, n])
  return url
}

function JobCard({ job, onOpen, onDelete }: { job: MediaJob; onOpen: () => void; onDelete: () => void }) {
  const url = useMediaBlob(job)
  const aspect = job.params.size === 'retrato' ? 'aspect-[2/3]' : job.params.size === 'paisagem' ? 'aspect-[3/2]' : 'aspect-square'
  return (
    <div className="glass group relative overflow-hidden rounded-2xl">
      <button onClick={onOpen} disabled={!url} className={`block w-full ${aspect} bg-panel`}>
        {url ? (
          <img src={url} alt={job.prompt} className="size-full object-cover transition group-hover:scale-[1.03]" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-dim">
            {job.status === 'erro' ? (
              <span className="text-red-300">{job.error || 'Erro'}</span>
            ) : (
              <>
                <Loader2 className="size-6 animate-spin text-neon" />
                {STATUS_LABELS[job.status]}
                {job.error && <span className="text-dim/80">{job.error}</span>}
              </>
            )}
          </div>
        )}
      </button>
      <div className="flex items-center gap-2 p-2.5">
        <p className="line-clamp-2 flex-1 text-xs text-dim" title={job.prompt}>
          {job.prompt}
        </p>
        <button onClick={onDelete} className="rounded-lg p-1.5 text-dim opacity-0 hover:text-red-300 group-hover:opacity-100" aria-label="Apagar">
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

function Viewer({ job, onClose }: { job: MediaJob; onClose: () => void }) {
  const url = useMediaBlob(job)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="glass max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <p className="flex-1 font-medium">{job.prompt}</p>
          {url && (
            <a
              href={url}
              download={`ayran-${job.id.slice(0, 8)}.png`}
              className="flex items-center gap-1 rounded-lg bg-neon px-3 py-1.5 text-sm font-semibold text-void"
            >
              <Download className="size-4" /> Baixar
            </a>
          )}
          <button onClick={onClose} className="rounded-lg p-1.5 text-dim hover:text-ink" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        {url && <img src={url} alt={job.prompt} className="mx-auto max-h-[70vh] rounded-xl" />}
        {job.final_prompt && (
          <p className="mt-3 text-xs text-dim">
            <span className="text-neon-soft">Prompt usado:</span> {job.final_prompt}
            {job.params.seed ? ` · seed ${job.params.seed}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}

function VideoLocked({ caps }: { caps: MediaCapabilities | null }) {
  return (
    <div className="glass flex flex-col items-center gap-4 rounded-2xl px-6 py-14 text-center">
      <div className="rounded-2xl bg-violet/15 p-4 text-violet-300">
        <Clapperboard className="size-8" />
      </div>
      <h3 className="text-xl font-semibold">Gerador de vídeo — pronto pra quando a placa chegar</h3>
      <p className="max-w-lg text-dim">
        Vídeo precisa de uma placa de vídeo com pelo menos {caps?.video_min_vram_gb ?? 16} GB (ideal 24 GB). Este servidor
        tem {caps?.vram_gb ?? '?'} GB. Quando o PC novo estiver rodando, esta aba libera sozinha.
      </p>
    </div>
  )
}
