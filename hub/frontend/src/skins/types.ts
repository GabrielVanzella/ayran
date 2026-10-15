import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Scene, User } from '../lib/api'
import type { Tab } from '../App'

export type NavItem = { id: Tab; label: string; icon: LucideIcon }

/** O que toda interface (skin) recebe do App: a estrutura muda, os dados e as telas sao os mesmos. */
export type ShellProps = {
  scene: Scene
  tab: Tab
  title: string
  nav: NavItem[]
  onTab: (t: Tab) => void
  user: User
  query: string
  onQuery: (q: string) => void
  onSearch: () => void
  bell: ReactNode
  picker: ReactNode
  onAccount: () => void
  onLogout: () => void
  isLocal: boolean
  children: ReactNode
}
