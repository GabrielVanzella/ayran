import { useEffect, useState } from 'react'
import { BASE } from './api'

export type Credit = { title: string; author: string; license: string; page: string }
let cache: Promise<Record<string, Credit>> | null = null

/** Credito (autor e licenca) da foto de fundo de uma cena. As licencas CC BY / CC BY-SA exigem citar o autor. */
export function useSceneCredit(scene: string): Credit | null {
  const [c, setC] = useState<Credit | null>(null)
  useEffect(() => {
    cache ??= fetch(`${BASE}/scenes/credits.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    cache.then((all) => setC(all[scene] ?? null))
  }, [scene])
  return c
}
