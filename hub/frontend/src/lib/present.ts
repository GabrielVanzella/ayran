import { useSyncExternalStore } from 'react'

// Modo apresentacao: deixa a tela limpa e repetivel para demonstracoes e prints (sem avisos que aparecem sozinhos,
// sem e-mail "chegando", sem as etiquetas "Exemplo"; um selo discreto avisa que os dados sao ficticios).
const KEY = 'ayran.present'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    if (new URLSearchParams(location.search).get('apresentacao') === '1') return true
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
let current = read()

export const isPresenting = () => current

export function setPresenting(on: boolean) {
  current = on
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* vale so ate recarregar */
  }
  listeners.forEach((l) => l())
}

export function usePresenting(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}
