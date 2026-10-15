import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import type { Scene } from './api'
import { BASE } from './api'
import { heroUrl } from './brand'

export const SCENES: { id: Scene; label: string }[] = [
  { id: 'praia', label: 'Calor' },
  { id: 'dia', label: 'Dia claro' },
  { id: 'sol', label: 'Pôr do sol' },
  { id: 'nublado', label: 'Nublado' },
  { id: 'chuva', label: 'Chuva' },
  { id: 'tempestade', label: 'Tempestade' },
  { id: 'neblina', label: 'Neblina' },
  { id: 'noite', label: 'Noite' },
  { id: 'frio', label: 'Frio' },
]

/** Fundo escolhido pelo usuario/empresa alem das cenas de clima. */
export const EXTRA_SCENES: { id: Scene; label: string }[] = [
  { id: 'escritorio', label: 'Escritório' },
  { id: 'custom', label: 'Minha imagem' },
]

export const sceneUrl = (scene: Scene) => (scene === 'custom' ? heroUrl() : `${BASE}/scenes/${scene}.jpg`)

/** null = padrao da empresa; 'auto' = segue o clima; ou uma cena fixa. */
export type Pin = Scene | 'auto' | null

/** Cena enquanto o clima nao chegou (ou sem cidade escolhida): so olha a hora. */
export function sceneByClock(date = new Date()): Scene {
  const h = date.getHours()
  return h < 6 || h >= 19 ? 'noite' : 'sol'
}

const isScene = (v: string | null): v is Scene => !!v && [...SCENES, ...EXTRA_SCENES].some((s) => s.id === v)

/** ?scene=chuva na URL forca uma cena (util pra testar e mostrar). */
export function sceneFromUrl(): Scene | null {
  const v = new URLSearchParams(location.search).get('scene')
  return isScene(v) ? v : null
}

const PIN_KEY = 'ayran.scene'
export function loadPinnedScene(): Pin {
  try {
    const v = localStorage.getItem(PIN_KEY)
    return v === 'auto' ? 'auto' : isScene(v) ? v : null
  } catch {
    return null
  }
}
export function savePinnedScene(scene: Pin) {
  try {
    if (scene) localStorage.setItem(PIN_KEY, scene)
    else localStorage.removeItem(PIN_KEY)
  } catch {
    /* sem storage: vale so ate recarregar */
  }
}

export function weatherIcon(code: number, isDay = true): LucideIcon {
  if (code === 0 || code === 1) return isDay ? Sun : Moon
  if (code === 2) return isDay ? CloudSun : CloudMoon
  if (code === 3) return Cloud
  if (code === 45 || code === 48) return CloudFog
  if (code >= 51 && code <= 57) return CloudDrizzle
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return Snowflake
  if (code >= 95) return CloudLightning
  return Cloud
}

export const weekday = (isoDate: string, long = false) =>
  new Date(isoDate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: long ? 'long' : 'short' }).replace('.', '')
