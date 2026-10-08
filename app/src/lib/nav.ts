import { Radar } from 'lucide-react'

// The rail's one group: the tool's pages. A lib module so rail.tsx exports
// components only.

export interface RailLeaf {
  to: string
  label: string
  exact?: boolean
  activeFor?: string[]
}

export interface RailGroup {
  label: string
  icon: typeof Radar
  children: readonly RailLeaf[]
}

export const TRACKER_GROUP: RailGroup = {
  label: 'Prompt Tracker',
  icon: Radar,
  children: [
    { to: '/', label: 'Overview', exact: true },
    { to: '/prompts', label: 'Prompts', activeFor: ['/prompts'] },
    { to: '/citations', label: 'Citations' },
    { to: '/settings', label: 'Settings' },
  ],
}
