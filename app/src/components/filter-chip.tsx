import { cn } from '@/lib/utils'

/**
 * `.filter-chip` — pill button (radius 999px), 14px / 6px padding, 13px text,
 *  border-border + bg-surface default, the inverse block when active.
 *  Count: 11px, padded pill background (inverse-fg/20 active, surface-2 inactive).
 */
export function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean
  count?: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'border-border-default text-text-muted hover:border-border-strong hover:text-text inline-flex cursor-pointer items-center gap-1.5 rounded-full border bg-surface px-[14px] py-1.5 text-[13px] transition-colors',
        active &&
          'border-inverse bg-inverse text-inverse-fg hover:text-inverse-fg hover:border-inverse',
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'inline-flex rounded-full px-1.5 py-px text-[11px]',
            active
              ? 'bg-inverse-fg/20 text-inverse-fg'
              : 'bg-surface-2 text-text-soft',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('mb-[18px] flex flex-wrap items-center gap-2.5', className)}
    >
      {children}
    </div>
  )
}
