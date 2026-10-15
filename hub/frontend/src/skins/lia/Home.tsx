import { useEffect, useState } from 'react'
import { AudioLines, MapPin, Mic } from 'lucide-react'
import BriefingCard from '../../components/BriefingCard'
import TasksCard from '../../components/TasksCard'
import LocationPicker from '../../components/LocationPicker'
import { AgendaCard, MailCard } from '../../components/HomeCards'
import type { HomeProps } from '../../components/Home'
import type { Pin } from '../../lib/weather'
import { useSceneCredit } from '../../lib/credits'
import { EXTRA_SCENES, SCENES, sceneUrl, weatherIcon } from '../../lib/weather'
import { heroStyle, useBrand } from '../../lib/brand'
import BrandMark from '../../components/BrandMark'
import { AttentionTile, KpiStrip, NewsTile, ProjectRings, ShieldTile, TeamTile } from './tiles'

const GRADIENT = 'bg-gradient-to-r from-[#2563eb] via-[#6366f1] to-[#7c3aed]'

function greeting(h: number) {
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

const QUICK = ['Organize as minhas prioridades de hoje', 'Resuma os e-mails importantes', 'Sugira ações para vender mais este mês']

export default function LiaHome(p: HomeProps) {
  const [now, setNow] = useState(new Date())
  const [editingCity, setEditingCity] = useState(false)
  const credit = useSceneCredit(p.scene)
  const brand = useBrand()
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  const first = p.userName.split(' ')[0]
  const WeatherIcon = p.weather ? weatherIcon(p.weather.current.code, p.weather.current.is_day) : null

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="grid gap-4 lg:grid-cols-12">
        {/* ---------- bloco principal: foto de clima, relogio e voz ---------- */}
        <section
          aria-label="Painel principal"
          className="relative min-h-[360px] overflow-hidden rounded-[32px] border border-white/90 bg-cover bg-center shadow-[0_30px_70px_-34px_rgba(67,56,202,0.5)] lg:col-span-8"
          style={{ backgroundImage: `url(${sceneUrl(p.scene)})`, ...(p.scene === 'custom' ? heroStyle(brand) : {}) }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#f3f6fc]/90 via-[#f3f6fc]/45 to-transparent" aria-hidden />
          <div className="relative flex h-full min-h-[360px] flex-col justify-between gap-6 p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="glass-pill flex items-center gap-3 rounded-2xl px-4 py-2" aria-label="Empresa">
                <BrandMark height={26} />
                {brand.site && <span className="lia-mono hidden border-l border-[color:var(--color-line)] pl-3 text-dim sm:block">{brand.site}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
              <label className="glass-pill flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
                <span className="lia-mono text-dim">Imagem</span>
                <select
                  value={p.pinned ?? 'default'}
                  onChange={(e) => p.onPin(e.target.value === 'default' ? null : (e.target.value as Pin))}
                  className="bg-transparent outline-none"
                  aria-label="Imagem principal"
                >
                  <option value="default">Padrão da empresa</option>
                  <option value="auto">Clima (automático)</option>
                  {[...EXTRA_SCENES.filter((s) => s.id !== 'custom' || brand.has_hero), ...SCENES].map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => setEditingCity((v) => !v)} className="glass-pill flex items-center gap-2 rounded-full py-1.5 pl-3 pr-4 text-sm">
                {p.weather && p.location && WeatherIcon ? (
                  <>
                    <WeatherIcon className="size-5" />
                    <span className="tabular-nums">{Math.round(p.weather.current.temp)}°C</span>
                    <span className="text-dim">
                      {p.weather.current.label} · {p.location.name}
                    </span>
                  </>
                ) : (
                  <>
                    <MapPin className="size-4" /> Escolher cidade
                  </>
                )}
              </button>
              </div>
            </div>

            {(editingCity || !p.location) && (
              <div className="glass max-w-md rounded-3xl p-4">
                <LocationPicker
                  autoFocus
                  onAuthError={p.onAuthError}
                  onClose={p.location ? () => setEditingCity(false) : undefined}
                  onPick={(l) => {
                    p.onLocation(l)
                    setEditingCity(false)
                  }}
                />
              </div>
            )}

            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="lia-mono text-dim">{now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <p className="mt-1 text-7xl font-light leading-none tabular-nums sm:text-8xl">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
                  {greeting(now.getHours())}, <span className="lia-gradient-text">{first}</span>.
                </h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-dim">
                  <span className={`size-2 rounded-full ${p.online ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  {p.online ? 'Ayran online e pronto.' : 'Ayran offline. Verifique o servidor.'}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button onClick={p.onVoice} className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-[#ffffff] shadow-lg shadow-indigo-500/30 transition hover:brightness-110 ${GRADIENT}`}>
                    <Mic className="size-4" /> Falar agora
                  </button>
                  {QUICK.map((q) => (
                    <button key={q} onClick={() => p.onAsk(q)} className="glass-pill rounded-full px-4 py-2 text-xs transition hover:bg-white">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={p.onVoice} aria-label="Conversar por voz" className="absolute bottom-16 right-14 hidden size-24 sm:block">
              <span className="lia-core block size-full" />
              <AudioLines className="absolute inset-0 m-auto size-8 text-[#ffffff]" />
            </button>
          </div>
          {credit && (
            <a
              href={credit.page}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-2 right-4 text-[10px] text-[#ffffff] [text-shadow:0_1px_3px_rgba(0,0,0,0.7)] hover:underline"
            >
              Foto: {credit.author} · {credit.license} · Wikimedia Commons
            </a>
          )}
        </section>

        <div className="grid gap-4 lg:col-span-4">
          <ShieldTile onMore={() => p.onGo('mail')} onAuthError={p.onAuthError} />
          <AgendaCard onMore={() => p.onGo('agenda')} onAuthError={p.onAuthError} />
        </div>
      </div>

      <KpiStrip onMore={() => p.onGo('business')} onAuthError={p.onAuthError} />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <BriefingCard onAuthError={p.onAuthError} />
        </div>
        <div className="lg:col-span-4">
          <MailCard onOpen={p.onOpenMail} onMore={() => p.onGo('mail')} onAuthError={p.onAuthError} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TasksCard onMore={() => p.onGo('tasks')} onAuthError={p.onAuthError} />
        <ProjectRings onMore={() => p.onGo('business')} />
        <TeamTile onMore={() => p.onGo('business')} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AttentionTile onGo={p.onGo} onAsk={p.onAsk} onAuthError={p.onAuthError} />
        <NewsTile onMore={() => p.onGo('news')} />
      </div>
    </div>
  )
}
