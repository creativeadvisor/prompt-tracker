import { cn } from '@/lib/utils'

/** A small pill: 11px / weight 600 / px 9px py 3px / radius full. */
const BADGE_BASE =
  'inline-flex items-center whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.2px]'

export type BadgeVariant = 'source' | 'type' | 'urgent'

export function Badge({
  children,
  variant = 'source',
  className,
}: {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}) {
  return (
    <span
      className={cn(
        BADGE_BASE,
        variant === 'source' && 'bg-surface-2 text-text-muted',
        variant === 'type' && 'bg-accent-soft text-accent-deep',
        variant === 'urgent' && 'bg-danger-soft text-danger',
        className,
      )}
    >
      {children}
    </span>
  )
}
