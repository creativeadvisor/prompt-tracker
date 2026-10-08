import { useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, LogOut, Menu, Monitor, Moon, Sun, X } from 'lucide-react'
import type { RailGroup, RailLeaf } from '@/lib/nav'
import { RailCollapsedContext } from '@/lib/rail-collapsed'
import { setThemePref, useThemePref, type ThemePref } from '@/lib/theme'
import { signOut } from '@/lib/auth'
import { cn } from '@/lib/utils'

// The app shell: a 260px rail (its own `sidebar-*` token register, so it
// can differ from the page in any theme) on desktop, a topbar plus the
// same rail as a drawer on phones.

function RailChildLink({ to, label, exact, activeFor }: RailLeaf) {
  const { pathname } = useLocation()
  const activeClass = 'bg-sidebar-accent !text-sidebar-fg-strong'
  const deepActive = !!activeFor?.some((p) => pathname === p || pathname.startsWith(p + '/'))
  return (
    <Link
      to={to}
      activeOptions={{ exact: !!exact }}
      className={cn(
        'flex items-center gap-2 rounded-[7px] px-3 py-[7px] text-13 font-medium text-sidebar-fg no-underline transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg-strong hover:no-underline',
        deepActive && activeClass,
      )}
      activeProps={{ className: activeClass }}
    >
      {label}
    </Link>
  )
}

function RailGroupEntry({ label, icon: Icon, children }: RailGroup) {
  const { pathname } = useLocation()
  const inside = (p: string) => pathname === p || pathname.startsWith(p + '/')
  const hasActive = children.some(
    (c) => (c.exact ? pathname === c.to : inside(c.to)) || !!c.activeFor?.some(inside),
  )
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const open = userOpen ?? hasActive
  return (
    <div>
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className={cn(
          'text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg-strong flex w-full items-center gap-2.5 rounded-[7px] px-3 py-2 text-13 font-medium transition-colors',
          hasActive && 'text-sidebar-fg-strong',
        )}
      >
        <Icon aria-hidden size={16} strokeWidth={2} className="shrink-0" />
        {label}
        {open ? (
          <ChevronDown aria-hidden size={14} strokeWidth={2} className="text-sidebar-fg/70 ml-auto shrink-0" />
        ) : (
          <ChevronRight aria-hidden size={14} strokeWidth={2} className="text-sidebar-fg/70 ml-auto shrink-0" />
        )}
      </button>
      {open && (
        <div className="border-sidebar-border mt-0.5 ml-[19px] flex flex-col gap-0.5 border-l pl-2">
          {children.map((c) => (
            <RailChildLink key={c.to} {...c} />
          ))}
        </div>
      )}
    </div>
  )
}

/** The product name as the wordmark: a small accent square and the name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <span aria-hidden className="bg-accent-deep grid h-7 w-7 shrink-0 place-items-center rounded-[7px]">
        <span className="bg-on-backdrop block h-2 w-2 rounded-full" />
      </span>
      <span className="text-sidebar-fg-strong min-w-0 truncate text-sm font-semibold">Prompt Tracker</span>
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sidebar-fg/85 mb-2 px-3 text-[10.5px] font-bold tracking-[0.09em] uppercase">
      {children}
    </div>
  )
}

const THEME_OPTIONS: { k: ThemePref; label: string; icon: typeof Sun }[] = [
  { k: 'system', label: 'System', icon: Monitor },
  { k: 'dark', label: 'Dark', icon: Moon },
  { k: 'light', label: 'Light', icon: Sun },
]

function RailFoot() {
  const pref = useThemePref()
  return (
    <div className="border-sidebar-border flex items-center justify-between gap-2 border-t px-3 py-3">
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="border-sidebar-border inline-flex rounded-[7px] border p-0.5"
      >
        {THEME_OPTIONS.map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={pref === k}
            aria-label={label}
            onClick={() => setThemePref(k)}
            className={cn(
              'text-sidebar-fg hover:text-sidebar-fg-strong grid h-7 w-7 place-items-center rounded-[5px]',
              pref === k && 'bg-sidebar-accent text-sidebar-fg-strong',
            )}
          >
            <Icon aria-hidden size={14} strokeWidth={2} />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void signOut().then(() => window.location.assign('/signin'))}
        className="text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg-strong flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-xs font-medium"
      >
        <LogOut aria-hidden size={14} strokeWidth={2} />
        Sign out
      </button>
    </div>
  )
}

function RailBody({
  items,
  scopeSlot,
}: {
  items: readonly RailGroup[]
  scopeSlot?: React.ReactNode
}) {
  return (
    <>
      <div className="border-sidebar-border flex items-center gap-2.5 border-b px-4 py-3.5">
        <Wordmark />
      </div>
      <nav className="rail-scroll flex-1 overflow-y-auto px-3 py-4" aria-label="Sections">
        {scopeSlot && <div className="mb-4">{scopeSlot}</div>}
        <SectionLabel>Tracking</SectionLabel>
        <div className="flex flex-col gap-0.5">
          {items.map((g) => (
            <RailGroupEntry key={g.label} {...g} />
          ))}
        </div>
      </nav>
      <RailFoot />
    </>
  )
}

export function AppShell({
  items,
  scopeSlot,
  children,
}: {
  items: readonly RailGroup[]
  scopeSlot?: React.ReactNode
  children: React.ReactNode
}) {
  const [drawer, setDrawer] = useState(false)
  return (
    <RailCollapsedContext.Provider value={false}>
      <div className="bg-bg min-h-screen">
        <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col border-r md:flex">
          <RailBody items={items} scopeSlot={scopeSlot} />
        </aside>

        {/* Phone: topbar + the same rail as a drawer. */}
        <header className="topbar-glass border-border-default sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-2.5 md:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setDrawer(true)}
            className="btn btn-ghost min-w-0 px-2"
          >
            <Menu aria-hidden size={18} />
          </button>
          <Wordmark />
        </header>
        {drawer && (
          <div className="fixed inset-0 z-30 md:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawer(false)}
              className="bg-backdrop/55 absolute inset-0"
            />
            <aside className="bg-sidebar border-sidebar-border absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r">
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setDrawer(false)}
                className="text-sidebar-fg hover:text-sidebar-fg-strong absolute top-3 right-3 grid h-8 w-8 place-items-center rounded-[7px]"
              >
                <X aria-hidden size={16} />
              </button>
              <div onClick={(e) => (e.target as HTMLElement).closest('a') && setDrawer(false)}>
                <RailBody items={items} scopeSlot={scopeSlot} />
              </div>
            </aside>
          </div>
        )}

        <main className="min-w-0 md:pl-[260px]">{children}</main>
      </div>
    </RailCollapsedContext.Provider>
  )
}
