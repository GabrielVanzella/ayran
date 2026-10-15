import type { ComponentType } from 'react'
import AyranHome from '../components/Home'
import type { HomeProps } from '../components/Home'
import type { SkinId } from '../lib/skin'
import AyranShell from './ayran/Shell'
import LiaHome from './lia/Home'
import LiaShell from './lia/Shell'
import type { ShellProps } from './types'

/**
 * Registro das interfaces. Para criar um modelo novo (ou um por cliente): uma pasta em skins/ com Shell e Home,
 * uma entrada aqui e outra em lib/skin.ts. Os dados e as telas internas (e-mail, agenda...) sao compartilhados.
 */
export const SKIN_COMPONENTS: Record<SkinId, { Shell: ComponentType<ShellProps>; Home: ComponentType<HomeProps> }> = {
  ayran: { Shell: AyranShell, Home: AyranHome },
  lia: { Shell: LiaShell, Home: LiaHome },
}
