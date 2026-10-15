import { useEffect, useState, type CSSProperties } from 'react'
import { BASE, getBrand, type Brand } from './api'

const DEFAULT: Brand = { name: 'VZ Tecnologia', site: 'vztecnologia.com.br', hero_default: 'escritorio', hero_focus: 'center', hero_zoom: 100, has_hero: false, has_logo: false, hero_v: 0, logo_v: 0 }

let current: Brand = DEFAULT
let loaded = false
const listeners = new Set<(b: Brand) => void>()

export const heroUrl = () => `${BASE}/api/brand/hero.jpg?v=${current.hero_v}`
export const logoUrl = (b: Brand = current) => `${BASE}/api/brand/logo.png?v=${b.logo_v}`

/** Enquadramento da imagem da empresa: posicao e zoom, para o texto da tela inicial nao cobrir o que importa. */
export function heroStyle(b: Brand): CSSProperties {
  const x = b.hero_focus === 'left' ? '0%' : b.hero_focus === 'right' ? '100%' : '50%'
  return { backgroundSize: b.hero_zoom > 100 ? `${b.hero_zoom}% auto` : 'cover', backgroundPosition: `${x} 45%`, backgroundRepeat: 'no-repeat' }
}

/** Atualiza a identidade em memoria e avisa quem usa (ex.: depois de enviar um logo novo). */
export function setBrand(b: Brand) {
  current = b
  listeners.forEach((l) => l(b))
}

/** Identidade da empresa (nome, logo, imagem principal). Carrega uma vez e acompanha mudancas. */
export function useBrand(): Brand {
  const [b, setB] = useState(current)
  useEffect(() => {
    listeners.add(setB)
    if (!loaded) {
      loaded = true
      getBrand()
        .then(setBrand)
        .catch(() => {
          loaded = false
        })
    }
    return () => {
      listeners.delete(setB)
    }
  }, [])
  return b
}
