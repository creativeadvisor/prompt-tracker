import { cn } from '@/lib/utils'

/**
 * `.stat-card` — surface bg, border, radius 10px, padding 18/20.
 * Label: 12px uppercase text-soft, tracking 0.5px.
 * Value: 28px / weight 700 / tracking -0.5px.
 * Trend: 12px text-muted.
 */
export function StatCard({
  label,
  value,
  trend,
  accentClass,
  className,
  onClick,
  active,
}: {
  label: React.ReactNode
  value: React.ReactNode
  trend?: React.ReactNode
  accentClass?: string
  className?: string
  /** Makes the card a real button (e.g. stat → matching feed filter). */
  onClick?: () => void
  /** The card's filter is applied — pressed ring; clicking again clears. */
  active?: boolean
}) {
  const body = (
    <>
      <div className="text-text-soft text-[12px] font-normal uppercase tracking-[0.5px]">
        {label}
      </div>
      <div
        className={cn(
          'text-text text-[17px] leading-none font-bold tracking-[-0.5px] md:mt-1 md:text-[28px]',
          accentClass,
        )}
      >
        {value}
      </div>
      {trend && (
        <div className="text-text-muted mt-0.5 hidden text-[12px] md:block">
          {trend}
        </div>
      )}
    </>
  )
  // Phone: a label · value row inside StatsRow's shared container (trend
  // hidden — flavor text, not worth a row's height). md+: the classic card.
  const frame =
    'flex w-full items-center justify-between gap-3 px-4 py-3 md:block md:bg-surface md:border-border-default md:rounded-md md:border md:px-5 md:py-[18px]'
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          frame,
          'hover:bg-surface-2 cursor-pointer text-left transition-colors md:hover:border-border-strong md:hover:bg-surface',
          active &&
            'bg-surface-2 md:border-border-strong md:shadow-[inset_0_0_0_1px_var(--color-border-strong)]',
          className,
        )}
      >
        {body}
      </button>
    )
  }
  return <div className={cn(frame, className)}>{body}</div>
}

/** `.stats` — 4-up grid on md+; on phones one bordered container of
 * hairline-divided rows (the cards were too bulky). */
export function StatsRow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-surface border-border-default divide-border-default mb-7 flex flex-col divide-y rounded-md border',
        'md:grid md:grid-cols-4 md:gap-4 md:divide-y-0 md:rounded-none md:border-0 md:bg-transparent',
        className,
      )}
    >
      {children}
    </div>
  )
}
