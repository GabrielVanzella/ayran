import { useEffect, useState } from 'react'
import { AuthError, getProject, listProjects, type ProjectOverview } from './api'

/** Projetos Git conectados com o resumo de cada um. `null` = ainda carregando; lista vazia = nenhum conectado. */
export function useProjectOverviews(limit = 4, onAuthError?: () => void): ProjectOverview[] | null {
  const [items, setItems] = useState<ProjectOverview[] | null>(null)
  useEffect(() => {
    let alive = true
    listProjects()
      .then(async (list) => {
        const out = await Promise.all(list.slice(0, limit).map((p) => getProject(p.id).catch(() => null)))
        if (alive) setItems(out.filter((x): x is ProjectOverview => !!x))
      })
      .catch((e) => {
        if (e instanceof AuthError) onAuthError?.()
        if (alive) setItems([])
      })
    return () => {
      alive = false
    }
  }, [limit, onAuthError])
  return items
}
