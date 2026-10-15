import { logoUrl, useBrand } from '../lib/brand'

/**
 * Logo da empresa; sem logo enviado, mostra o nome como marca de texto.
 * `plate`: coloca o logo sobre uma plaquinha clara, para logos de texto escuro continuarem legiveis em fundo escuro.
 */
export default function BrandMark({ className = '', height = 28, plate = false }: { className?: string; height?: number; plate?: boolean }) {
  const b = useBrand()
  if (b.has_logo) {
    const img = <img src={logoUrl(b)} alt={b.name} style={{ height }} className="w-auto max-w-[10rem] object-contain" />
    return plate ? <span className={`inline-flex items-center rounded-xl bg-[#ffffffee] px-2 py-1 ${className}`}>{img}</span> : <span className={className}>{img}</span>
  }
  return <span className={`whitespace-nowrap text-sm font-semibold tracking-wide ${className}`}>{b.name}</span>
}
