// Tema da interface: escuro (padrao) ou claro. A escolha fica no navegador.
export type Theme = 'dark' | 'light'
const KEY = 'ayran.theme'

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* sem armazenamento: usa o padrao */
  }
  return 'dark'
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', t)
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* preferencia e opcional */
  }
}
