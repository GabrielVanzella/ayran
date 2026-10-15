// Interfaces (skins) do Ayran. Cada uma tem estrutura propria (navegacao, tela inicial, cartoes), nao so outra cor.
export type SkinId = 'ayran' | 'lia'

export const SKINS: { id: SkinId; name: string; tagline: string; details: string[] }[] = [
  {
    id: 'ayran',
    name: 'Ayran',
    tagline: 'Escura, imersiva',
    details: ['Foto de clima em tela cheia', 'Menu lateral em cápsula', 'Relógio grande e conversa em destaque'],
  },
  {
    id: 'lia',
    name: 'Lia',
    tagline: 'Clara, painel de gestão',
    details: ['Barra superior com abas', 'Faixa de indicadores no topo', 'Cartões brancos, leitura rápida'],
  },
]

const KEY = 'ayran.skin'

export function loadSkin(): SkinId {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'ayran' || v === 'lia') return v
  } catch {
    /* sem armazenamento: usa o padrao */
  }
  return 'ayran'
}

export function applySkin(id: SkinId) {
  document.documentElement.dataset.skin = id
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* a escolha e so uma preferencia */
  }
}
