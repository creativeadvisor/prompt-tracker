import { cn, rowLinkProps } from '@/lib/utils'
import type { SortDir, SortState } from '@/lib/table-sort'

// Phone rendering for row tables (inspiration: his
// campaign-manager cards): below md a table's rows become stacked cards
// carrying the SAME info — title leading, status pill pinned top-right,
// a wrapping meta line, an optional actions footer. Tables pick ONE
// rendering via useIsDesktop (no doubled DOM), and CardSortBar stands in
// for the column headers the card view loses, driving the same useSort
// state as the desktop table.

export function RowCardList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2.5">{children}</div>
}

export function RowCard({
  title,
  titleTrailing,
  sub,
  pill,
  meta,
  footer,
  onOpen,
}: {
  title: React.ReactNode
  /** Inline after the title (e.g. an Urgent badge). */
  titleTrailing?: React.ReactNode
  /** Secondary line under the title (publication / outlet / topic). */
  sub?: React.ReactNode
  /** Pinned top-right — a status badge or an interactive status control. */
  pill?: React.ReactNode
  /** Wrapping line of badges / short facts. */
  meta?: React.ReactNode
  /** Bottom action strip, separated by a hairline. */
  footer?: React.ReactNode
  /** Makes the card a tap target (interactive slots stop propagation). */
  onOpen?: () => void
}) {
  return (
    <div
      {...(onOpen ? rowLinkProps(onOpen) : {})}
      className={cn(
        'bg-surface border-border-default rounded-md border px-4 py-3',
        onOpen &&
          'hover:border-border-strong focus-visible:bg-surface-2 cursor-pointer',
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="text-text flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14.5px] leading-snug font-semibold">
            {title}
            {titleTrailing}
          </div>
          {sub && (
            <div className="text-text-muted mt-0.5 text-[13px]">{sub}</div>
          )}
        </div>
        {pill && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {pill}
          </div>
        )}
      </div>
      {meta && (
        <div className="text-text-muted mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]">
          {meta}
        </div>
      )}
      {footer && (
        <div
          className="border-border-default mt-2.5 flex items-center gap-3 border-t pt-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {footer}
        </div>
      )}
    </div>
  )
}

export interface CardSortOption {
  k: string
  label: string
  firstDir?: SortDir
}

/**
 * The card view's stand-in for clickable column headers: a field select
 * plus a direction flip, over the same sort state. Opens on the table's
 * resting order (the pass-through default key shows as "Default").
 */
export function CardSortBar({
  sort,
  onToggle,
  options,
  inline,
}: {
  sort: SortState
  onToggle: (key: string, firstDir?: SortDir) => void
  options: CardSortOption[]
  /** Riding a header's trailing slot — the parent places it, so no
   *  bottom margin or right-pinning of its own. */
  inline?: boolean
}) {
  const active = options.find((o) => o.k === sort.key)
  return (
    <div
      className={cn(
        'flex items-center gap-1.5',
        !inline && 'mb-2.5 justify-end',
      )}
    >
      <select
        value={active ? sort.key : ''}
        onChange={(e) => {
          const next = options.find((o) => o.k === e.target.value)
          if (next) onToggle(next.k, next.firstDir)
        }}
        className="form-select w-auto py-1.5 text-[13px]"
        aria-label="Sort by"
      >
        <option value="" disabled>
          Sort · Default
        </option>
        {options.map((o) => (
          <option key={o.k} value={o.k}>
            {o.label}
          </option>
        ))}
      </select>
      {active && (
        <button
          type="button"
          onClick={() => onToggle(sort.key)}
          aria-label={`Sorted ${sort.dir === 'asc' ? 'ascending' : 'descending'} — flip`}
          className="btn btn-secondary btn-sm min-w-0 px-2.5"
        >
          {sort.dir === 'asc' ? '▲' : '▼'}
        </button>
      )}
    </div>
  )
}
