import { cn } from '@/lib/utils'

/**
 * Standard authed-page container. Mirrors the old `.page` + `.container`:
 *   - max-width 1180px, centered, 24px horizontal padding
 *   - 32px top / 80px bottom vertical padding
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[var(--container-app)] px-4 pt-8 pb-20 sm:px-6',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * `.page-header` — 22px / weight 700 / tracking -0.3px title +
 *  14px text-muted subtitle. Tightened from 26px in the enterprise
 *  structural pass — operational pages carry their weight in content,
 *  not headline size.
 */
export function PageHeader({
  title,
  subtitle,
  trailing,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'mb-6 flex flex-wrap items-start justify-between gap-3',
        className,
      )}
    >
      <div>
        <h1 className="text-text mb-1 text-[22px] leading-tight font-bold tracking-[-0.3px]">
          {title}
        </h1>
        {subtitle && <p className="text-text-muted text-sm">{subtitle}</p>}
      </div>
      {trailing}
    </header>
  )
}

/** Titled section card — shared by the admin panels. */
export function Panel({
  title,
  trailing,
  children,
  className,
}: {
  title: React.ReactNode
  trailing?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('bg-surface border-border-default rounded-md border p-6', className)}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-text text-[17px] font-semibold tracking-[-0.2px]">
          {title}
        </h2>
        {trailing}
      </div>
      {children}
    </section>
  )
}
