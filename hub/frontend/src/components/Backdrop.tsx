import { useEffect, useState } from 'react'
import type { Scene } from '../lib/api'
import { sceneUrl } from '../lib/weather'

/** Fundo da aplicacao: a cena do clima, desfocada, com transicao suave entre cenas. */
export default function Backdrop({ scene }: { scene: Scene }) {
  const [layers, setLayers] = useState<{ scene: Scene; key: number }[]>([{ scene, key: 0 }])

  useEffect(() => {
    setLayers((prev) => (prev[prev.length - 1].scene === scene ? prev : [...prev, { scene, key: Date.now() }]))
    const t = setTimeout(() => setLayers((prev) => prev.slice(-1)), 1500)
    return () => clearTimeout(t)
  }, [scene])

  return (
    <>
      {layers.map((l) => (
        <div
          key={l.key}
          data-scene={l.scene}
          className="scene-layer"
          style={{ backgroundImage: `url(${sceneUrl(l.scene)}), var(--scene-fallback)` }}
        />
      ))}
      <div className="scene-veil" />
    </>
  )
}
