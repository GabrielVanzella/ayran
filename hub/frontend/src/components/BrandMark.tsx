import { logoUrl, useBrand } from '../lib/brand'

/** Logo da empresa; sem logo enviado, mostra o nome como marca de texto. */
export default function BrandMark({ className = '', height = 28 }: { className?: string; height?: number }) {
  const b = useBrand()
  if (b.has_logo) return <img src={logoUrl(b)} alt={b.name} style={{ height }} className={`w-auto max-w-[9rem] object-contain ${className}`} />
  return <span className={`whitespace-nowrap text-sm font-semibold tracking-wide ${className}`}>{b.name}</span>
}
