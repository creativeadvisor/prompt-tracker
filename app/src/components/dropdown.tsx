import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface DropdownProps {
  trigger: React.ReactNode
  triggerClassName?: string
  children: (props: { close: () => void }) => React.ReactNode
  align?: 'left' | 'right'
  menuClassName?: string
  /** Override the wrapper (default inline-block shrinks to content — pass 'block w-full' for full-width triggers). */
  containerClassName?: string
  /** Render the menu in a body portal so it can overflow scroll containers (e.g. the rail). */
  portal?: boolean
  /** Where the menu opens. `right`: portal mode only — fly out to the
   *  trigger's right, top-aligned (the collapsed rail's group tiles).
   *  `left`: non-portal only — fly out to the trigger's LEFT, top-aligned,
   *  for a submenu that lives inside another menu (the profile menu's
   *  Appearance row): staying in the parent's DOM keeps the parent's
   *  click-outside from firing on the submenu's items. */
  side?: 'bottom' | 'right' | 'left'
  /** Observe open/close (e.g. to hide a hover label while the menu shows). */
  onOpenChange?: (open: boolean) => void
}

/**
 * Lightweight dropdown matching the old `.dropdown` CSS pattern from `shared/styles.css`:
 *   - rounded `radius-sm` (6px) menu with 1px border, shadow-md, 6px inner padding
 *   - menu items are 9px / 12px padded, 14px text, hover bg-surface-2
 *   - click-outside + Escape to close, click any item to close
 */
export function Dropdown({
  trigger,
  triggerClassName,
  children,
  align = 'right',
  menuClassName,
  containerClassName,
  portal = false,
  side = 'bottom',
  onOpenChange,
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])
  const [pos, setPos] = useState<{
    top: number
    left: number
    right: number
    width: number
    /** The trigger's top edge — where a flipped menu hangs from. */
    triggerTop: number
  } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Keep a portaled menu on screen (a select near the foot of a page would
  // otherwise open off the bottom, unselectable).
  // Measured on mount via the ref callback and fixed up imperatively —
  // no state, no re-render: if the menu overflows the viewport bottom,
  // flip it above the trigger when there's more room there, otherwise
  // cap its height so it scrolls within the space that exists.
  const placeMenu = (el: HTMLDivElement | null) => {
    menuRef.current = el
    if (!el || !portal || !pos) return
    const margin = 8
    const h = el.offsetHeight
    const spaceBelow = window.innerHeight - pos.top - margin
    if (h <= spaceBelow) return
    const spaceAbove = pos.triggerTop - 6 - margin
    if (spaceAbove > spaceBelow) {
      const height = Math.min(h, spaceAbove)
      el.style.top = `${Math.max(margin, pos.triggerTop - 6 - height)}px`
      el.style.maxHeight = `${height}px`
    } else {
      el.style.maxHeight = `${Math.max(120, spaceBelow)}px`
    }
  }

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      if (
        ref.current &&
        !ref.current.contains(t) &&
        !(menuRef.current && menuRef.current.contains(t))
      ) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    // A portaled menu is position:fixed — any scroll would detach it from
    // the trigger, so close instead of chasing coordinates.
    // A portaled menu is positioned against a snapshot of the trigger,
    // so scrolling the PAGE closes it rather than leaving it stranded —
    // but scrolling INSIDE the menu (a long brand list) is the menu
    // working, not moving.
    function handleScroll(e: Event) {
      if (menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    if (portal) document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
      if (portal) document.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, portal])

  return (
    <div ref={ref} className={cn('relative inline-block', containerClassName)}>
      <button
        type="button"
        onClick={() => {
          if (!open && portal && ref.current) {
            const r = ref.current.getBoundingClientRect()
            setPos(
              side === 'right'
                ? {
                    top: r.top,
                    left: r.right + 8,
                    right: r.right,
                    width: 0,
                    triggerTop: r.top,
                  }
                : {
                    top: r.bottom + 6,
                    left: r.left,
                    right: r.right,
                    width: r.width,
                    triggerTop: r.top,
                  },
            )
          }
          setOpen((v) => !v)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn('inline-flex items-center gap-1.5', triggerClassName)}
      >
        {trigger}
      </button>
      {open &&
        (portal && pos ? (
          createPortal(
            <div
              role="menu"
              ref={placeMenu}
              // Honor `align` in portal mode too: a right-aligned menu
              // anchors its RIGHT edge to the trigger's right, so triggers
              // near the viewport edge (the table's pinned actions column)
              // can't push the menu off-screen.
              // maxWidth clamps both alignments to the viewport (a phone
              // trigger near either edge can't push the menu off-screen);
              // max-h + overflow keep long lists scrollable.
              style={
                align === 'right'
                  ? {
                      top: pos.top,
                      left: pos.right,
                      transform: 'translateX(-100%)',
                      minWidth: pos.width,
                      maxWidth: 'calc(100vw - 16px)',
                    }
                  : {
                      top: pos.top,
                      left: pos.left,
                      minWidth: pos.width,
                      maxWidth: 'calc(100vw - 16px)',
                    }
              }
              className={cn(
                'border-border-default bg-surface-elevated fixed z-[200] max-h-[70vh] overflow-y-auto rounded-md border p-1.5 shadow-card-md',
                menuClassName,
              )}
            >
              {children({ close: () => setOpen(false) })}
            </div>,
            document.body,
          )
        ) : (
          <div
            role="menu"
            className={cn(
              'border-border-default bg-surface-elevated absolute z-30 min-w-40 rounded-md border p-1.5 shadow-card-md',
              side === 'left'
                ? // A left flyout has no room on a phone: sit beneath the row
                  // inside the parent menu instead.
                  'top-0 right-full mr-1.5 max-sm:static max-sm:mt-1.5 max-sm:mr-0 max-sm:w-full'
                : cn('mt-1.5', align === 'right' ? 'right-0' : 'left-0'),
              menuClassName,
            )}
          >
            {children({ close: () => setOpen(false) })}
          </div>
        ))}
    </div>
  )
}

interface DropdownItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  current?: boolean
}

/** Styled menu item — matches the old `.dropdown-item` (block, 9/12 padding, 14px, hover bg-surface-2). */
export function DropdownItem({
  children,
  className,
  current,
  ...rest
}: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'text-text hover:bg-surface-2 block w-full rounded-md px-3 py-2 text-left text-sm',
        current && 'bg-accent-soft text-accent-deep font-semibold',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
