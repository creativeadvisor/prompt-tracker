import { cn } from '@/lib/utils'

// Segmented tab control — the design system's first (the first page that needed
// one; nothing else had in-page tabs). Deliberately NOT routed: these
// switch a panel within one page, so they carry no URL. If a tab ever
// needs to be linkable, promote it to a child route instead of adding
// query-param state here.
//
// Roving focus: only the selected tab is tabbable, and ←/→ move between
// them — the WAI-ARIA tabs pattern, so a keyboard user tabs past the
// strip rather than through every option.

export interface TabOption<K extends string> {
  k: K
  label: string
  /** Small count after the label (e.g. pending invites). */
  badge?: number
}

export function Tabs<K extends string>({
  value,
  onChange,
  options,
  className,
  label = 'Sections',
  variant = 'segmented',
}: {
  value: K
  onChange: (k: K) => void
  options: readonly TabOption<K>[]
  className?: string
  /** Accessible name for the tablist. */
  label?: string
  /** `segmented` = the pill strip (page-level sections); `underline` =
   *  text tabs on a hairline with the active one underlined — for sections
   *  INSIDE a page (the prompt page's Responses / Sentiment / History),
   *  where a pill strip would read as a second page header. */
  variant?: 'segmented' | 'underline'
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const i = options.findIndex((o) => o.k === value)
    const next = options[(i + dir + options.length) % options.length]
    onChange(next.k)
    // Follow focus to the newly selected tab, per the ARIA pattern.
    const el = e.currentTarget.querySelector<HTMLButtonElement>(
      `[data-tab="${next.k}"]`,
    )
    el?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        variant === 'underline'
          ? // Scrolls sideways on narrow screens — seven stage tabs must not
            // widen the page. The strip's hairline is an
            // inset shadow, not a border: `overflow-x-auto` turns any vertical
            // overflow into a scrollbar, and the old `-mb-px` underline
            // overlap was exactly that.
            'flex gap-6 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_0_var(--color-border-default)]'
          : 'bg-surface-2 border-border-default inline-flex gap-1 rounded-[9px] border p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.k === value
        return (
          <button
            key={o.k}
            type="button"
            role="tab"
            data-tab={o.k}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.k)}
            className={cn(
              'inline-flex items-center gap-1.5 transition-colors',
              variant === 'underline'
                ? cn(
                    'shrink-0 border-b-2 px-1 py-2.5 text-[13.5px] whitespace-nowrap',
                    active
                      ? 'border-text text-text font-semibold'
                      : 'text-text-muted hover:text-text border-transparent font-medium',
                  )
                : cn(
                    'rounded-[6px] px-3 py-1.5 text-[13px] font-medium',
                    active
                      ? 'bg-surface text-text shadow-card-sm'
                      : 'text-text-muted hover:text-text',
                  ),
            )}
          >
            {o.label}
            {o.badge != null && o.badge > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[11px] font-semibold',
                  active
                    ? 'bg-accent-soft text-accent-deep'
                    : 'bg-surface text-text-muted',
                )}
              >
                {o.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
