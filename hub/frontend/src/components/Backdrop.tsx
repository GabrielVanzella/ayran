import { useEffect, useState } from 'react'
import type { Scene } from '../lib/api'
import { sceneUrl } from '../lib/weather'

type Layer = { scene: Scene; src: string; key: number }

/**
 * Fundo da aplicacao: a cena do clima ocupando a tela inteira.
 * `imageUrl` e a vista da cidade do usuario (quando ja foi gerada); sem ela, usa a cena generica.
 * Nitida na tela inicial; desfocada e escurecida (`soft`) nas telas de leitura, pro texto continuar legivel.
 */
export default function Backdrop({ scene, imageUrl, soft = false }: { scene: Scene; imageUrl?: string | null; soft?: boolean }) {
  const src = imageUrl ?? sceneUrl(scene)
  const [layers, setLayers] = useState<Layer[]>([{ scene, src, key: 0 }])

  useEffect(() => {
    setLayers((prev) => (prev[prev.length - 1].src === src ? prev : [...prev, { scene, src, key: Date.now() }]))
    const t = setTimeout(() => setLayers((prev) => prev.slice(-1)), 1500)
    return () => clearTimeout(t)
  }, [scene, src])

  return (
    <>
      {layers.map((l) => (
        <div
          key={l.key}
          data-scene={l.scene}
          className={`scene-layer ${soft ? 'soft' : ''}`}
          style={{ backgroundImage: `url(${l.src}), var(--scene-fallback)` }}
        />
      ))}
      <div className={`scene-veil ${soft ? 'soft' : ''} ${scene === 'escritorio' || scene === 'custom' ? 'busy' : ''}`} />
    </>
  )
}
