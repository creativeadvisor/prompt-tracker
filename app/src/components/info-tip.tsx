import { cn } from '@/lib/utils'
import { HoverTip } from '@/components/hover-tip'

/**
 * `InfoTip` — a small "?" beside a form label that reveals a one-liner on
 * hover or keyboard focus (popover mechanics live in `HoverTip`). Copy rule: say what the field DOES
 * for the user, never how the machinery works.
 */
export function InfoTip({ text, className }: { text: string; className?: string }) {
  return (
    <HoverTip text={text} side="top" className={cn('align-middle', className)}>
      <span
        tabIndex={0}
        aria-label={text}
        className="border-border-default text-text-soft hover:border-border-strong hover:text-text-muted focus-visible:border-border-strong grid h-[15px] w-[15px] cursor-help place-items-center rounded-full border text-[9.5px] font-semibold"
      >
        ?
      </span>
    </HoverTip>
  )
}
