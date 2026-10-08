import { cn } from '@/lib/utils'
import type { SortDir, SortState } from '@/lib/table-sort'

export function Th({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={cn(
        'bg-surface-2 border-border-default text-text-soft border-b px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-[0.4px]',
        className,
      )}
    >
      {children}
    </th>
  )
}

/**
 * Clickable column header — same visual spec as Th, plus aria-sort.
 * Pairs with useSort/sortRows from @/lib/table-sort; every table sorts
 *
 */
export function SortTh({
  label,
  k,
  sort,
  onToggle,
  firstDir = 'asc',
  className,
  compact,
}: {
  label: string
  k: string
  sort: SortState
  onToggle: (key: string, firstDir?: SortDir) => void
  firstDir?: SortDir
  className?: string
  /** Dense-table scale (11px / px-2) — the import preview's headers. */
  compact?: boolean
}) {
  const active = sort.key === k
  return (
    <th
      aria-sort={
        active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
      className={cn(
        'bg-surface-2 border-border-default border-b p-0 text-left',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(k, firstDir)}
        className={cn(
          'hover:text-text flex w-full items-center gap-1 font-semibold uppercase',
          compact
            ? 'px-2 py-2 text-[11px] tracking-[0.06em]'
            : 'px-4 py-3 text-[12px] tracking-[0.4px]',
          active ? 'text-text' : 'text-text-soft',
        )}
      >
        {label}
        <span
          aria-hidden
          className={cn(compact ? 'text-[8px]' : 'text-[9px]', !active && 'opacity-30')}
        >
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▲▼'}
        </span>
      </button>
    </th>
  )
}
