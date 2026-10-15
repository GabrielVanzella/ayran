import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { AuthError, deleteBrandImage, saveBrand, uploadBrandImage, type Brand } from '../lib/api'
import { logoUrl, setBrand, useBrand } from '../lib/brand'
import { sceneUrl } from '../lib/weather'
import { ErrorLine } from './ui'

/** Identidade da empresa (so administrador): nome, site, logo e imagem principal da tela inicial. */
export default function BrandSettings({ onAuthError }: { onAuthError: () => void }) {
  const brand = useBrand()
  const [name, setName] = useState(brand.name)
  const [site, setSite] = useState(brand.site)
  const [hero, setHero] = useState<Brand['hero_default']>(brand.hero_default)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const logoInput = useRef<HTMLInputElement>(null)
  const heroInput = useRef<HTMLInputElement>(null)

  async function run(fn: () => Promise<Brand>, ok: string) {
    setBusy(true)
    setError('')
    setNote('')
    try {
      const b = await fn()
      setBrand(b)
      setHero(b.hero_default)
      setNote(ok)
    } catch (e) {
      if (e instanceof AuthError) return onAuthError()
      setError(e instanceof Error ? e.message : 'Algo deu errado')
    } finally {
      setBusy(false)
    }
  }

  const upload = (kind: 'logo' | 'hero') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) run(() => uploadBrandImage(kind, f), kind === 'logo' ? 'Logo atualizado.' : 'Imagem principal atualizada.')
  }

  return (
    <section className="glass rounded-[28px] p-5" aria-label="Identidade da empresa">
      <h3 className="font-medium">Identidade da empresa</h3>
      <p className="mb-4 text-sm text-dim">O logo aparece no topo das duas interfaces e a imagem principal vira o fundo da tela inicial. Cada usuário ainda pode trocar a imagem quando quiser.</p>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label htmlFor="brand-name" className="mb-1 block text-xs text-dim">Nome da empresa</label>
            <input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="field" />
          </div>
          <div>
            <label htmlFor="brand-site" className="mb-1 block text-xs text-dim">Site</label>
            <input id="brand-site" value={site} onChange={(e) => setSite(e.target.value)} maxLength={80} placeholder="exemplo.com.br" className="field" />
          </div>
          <div>
            <label htmlFor="brand-hero" className="mb-1 block text-xs text-dim">Imagem principal padrão</label>
            <select id="brand-hero" value={hero} onChange={(e) => setHero(e.target.value as Brand['hero_default'])} className="field">
              <option value="escritorio">Escritório de desenvolvimento</option>
              <option value="custom" disabled={!brand.has_hero}>
                A imagem da minha empresa {brand.has_hero ? '' : '(envie uma antes)'}
              </option>
              <option value="auto">Seguir o clima</option>
            </select>
          </div>
          <button
            disabled={busy || !name.trim()}
            onClick={() => run(() => saveBrand({ name, site, hero_default: hero }), 'Identidade salva.')}
            className="rounded-full bg-white px-5 py-2 text-sm font-medium text-void hover:bg-white/90 disabled:opacity-40"
          >
            Salvar
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs text-dim">Logo (PNG, JPG ou WebP)</p>
            <div className="flex items-center gap-3">
              <span className="grid h-14 w-40 place-items-center rounded-2xl border border-white/15 bg-white/5 px-2">
                {brand.has_logo ? <img src={logoUrl(brand)} alt={`Logo de ${brand.name}`} className="max-h-10 w-auto object-contain" /> : <span className="text-xs text-dim">Sem logo: usa o nome</span>}
              </span>
              <button disabled={busy} onClick={() => logoInput.current?.click()} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-40">
                <ImagePlus className="size-4" /> Enviar logo
              </button>
              {brand.has_logo && (
                <button disabled={busy} onClick={() => run(() => deleteBrandImage('logo'), 'Logo removido.')} aria-label="Remover logo" className="rounded-full p-2 text-dim hover:bg-white/10 hover:text-red-300">
                  <Trash2 className="size-4" />
                </button>
              )}
              <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Arquivo do logo" onChange={upload('logo')} />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs text-dim">Imagem principal (mínimo 1000 px de largura)</p>
            <div className="flex items-center gap-3">
              <span
                className="block h-14 w-40 rounded-2xl border border-white/15 bg-cover bg-center"
                style={{ backgroundImage: `url(${brand.has_hero ? sceneUrl('custom') : sceneUrl('escritorio')})` }}
                role="img"
                aria-label="Prévia da imagem principal"
              />
              <button disabled={busy} onClick={() => heroInput.current?.click()} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm hover:bg-white/20 disabled:opacity-40">
                <ImagePlus className="size-4" /> Enviar imagem
              </button>
              {brand.has_hero && (
                <button disabled={busy} onClick={() => run(() => deleteBrandImage('hero'), 'Imagem removida.')} aria-label="Remover imagem" className="rounded-full p-2 text-dim hover:bg-white/10 hover:text-red-300">
                  <Trash2 className="size-4" />
                </button>
              )}
              <input ref={heroInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Arquivo da imagem principal" onChange={upload('hero')} />
            </div>
          </div>
        </div>
      </div>

      {note && (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-emerald-300">
          {note}
        </p>
      )}
      {error && (
        <div className="mt-4">
          <ErrorLine message={error} />
        </div>
      )}
    </section>
  )
}
