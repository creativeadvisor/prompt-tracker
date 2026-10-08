import { useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

/** Breathing room kept between a tip and the window edge. */
const EDGE = 8

/**
 * Keep a revealed tip inside the window. CSS alone cannot: the bubble's
 * position is declared relative to its trigger, and whether that lands off
 * screen depends on where the trigger sits. So on every reveal we reset the
 * declared position, measure, and nudge — imperatively, with no state and no
 * re-render, the same trick the portaled `Dropdown` uses.
 *
 * This is the durable fix for a class of bug that kept coming back one
 * control at a time ("we run into that tooltip being cut
 * off a lot"): a tip near the left edge (the 64px rail), near the right edge
 * (a table's action column), or near the top of the viewport used to be
 * clipped, and each site had to discover its own `align` by hand. Now the
 * `side`/`align` props say where a tip PREFERS to sit, and this guarantees
 * it is readable wherever it ends up.
 */
function fitInViewport(el: HTMLSpanElement | null, side: 'top' | 'bottom' | 'right', align: 'center' | 'start' | 'end') {
  if (!el) return
  // Back to what the classes declare, so a second reveal never compounds
  // the first one's nudge.
  el.style.transform = ''
  el.style.left = ''
  el.style.right = ''
  el.style.top = ''
  el.style.bottom = ''
  el.style.margin = ''

  let r = el.getBoundingClientRect()
  if (!r.width) return // still display:none — nothing to fit

  if (side === 'right') {
    // Beside the trigger: flip to its other side when the window runs out.
    if (r.right > window.innerWidth - EDGE) {
      el.style.left = 'auto'
      el.style.right = '100%'
      el.style.marginLeft = '0'
      el.style.marginRight = '8px'
    }
  } else {
    // Above or below: slide sideways to clear whichever edge it overruns.
    const base = align === 'center' ? 'translateX(-50%)' : ''
    let dx = 0
    if (r.left < EDGE) dx = EDGE - r.left
    else if (r.right > window.innerWidth - EDGE) dx = window.innerWidth - EDGE - r.right
    if (dx) el.style.transform = `${base} translateX(${dx}px)`.trim()

    // …and flip over the trigger when there is no room on the chosen side.
    r = el.getBoundingClientRect()
    if (side === 'top' && r.top < EDGE) {
      el.style.top = '100%'
      el.style.bottom = 'auto'
      el.style.marginTop = '6px'
      el.style.marginBottom = '0'
    } else if (side === 'bottom' && r.bottom > window.innerHeight - EDGE) {
      el.style.bottom = '100%'
      el.style.top = 'auto'
      el.style.marginBottom = '6px'
      el.style.marginTop = '0'
    }
  }
}

/**
 * `HoverTip` — THE way to show a message on hover.
 * Native `title` tooltips render browser chrome that reads as foreign to
 * the product, and some browsers never show them over disabled controls.
 * This is the InfoTip popover generalized into a wrapper: CSS-only, a
 * positioned sibling revealed on wrapper hover or keyboard focus — no
 * portal, no state, works inside modals, never outlives its trigger.
 *
 * An ESLint gate (`no-restricted-syntax` in eslint.config.js) blocks
 * `title=` on DOM elements so every future hover message lands here.
 * `alt` / `aria-*` are untouched — accessibility, not tooltips.
 *
 * Falsy `text` renders the children alone (for conditional tips).
 */
export function HoverTip({
  text,
  side = 'bottom',
  align = 'center',
  className,
  muted = false,
  delayed = false,
  children,
}: {
  text: string | null | undefined
  /** Which side of the trigger the popover opens on. `right` is the
   *  icon-only register (the collapsed rail): a single-line label beside
   *  the trigger, vertically centered, `align` ignored. */
  side?: 'top' | 'bottom' | 'right'
  /** Horizontal anchor: centered on, or flush with either edge of, the trigger. */
  align?: 'center' | 'start' | 'end'
  className?: string
  /** Wait ~1s before the tip appears. For a control the user clicks often
   *  (the rail's collapse toggle), where an instant tip is noise on every
   *  pass. The reveal itself is unchanged — only its opacity is held back. */
  delayed?: boolean
  /** Keep the wrapper but show no tip — for a trigger whose own popover
   *  is open. Unlike falsy `text`, this never changes the tree shape, so
   *  the children keep their state (a Dropdown stays open). */
  muted?: boolean
  children: React.ReactNode
}) {
  const bubble = useRef<HTMLSpanElement>(null)
  // Measured on the frame AFTER the pointer arrives: at event time the
  // :hover rule may not have flipped `display` yet, and a display:none
  // element measures as zero.
  const fit = useCallback(() => {
    requestAnimationFrame(() => fitInViewport(bubble.current, side, align))
  }, [side, align])

  if (!text) return <>{children}</>
  return (
    <span
      className={cn('group/tip relative inline-flex', className)}
      onMouseEnter={fit}
      onFocusCapture={fit}
    >
      {children}
      {/* display:none (not visibility) until hover — an invisible
          absolutely-positioned popover still contributes to its scroll
          container's overflow area, which grew phantom scrollbars on
          overflow-x-auto tables. */}
      {!muted && (
        <span
          ref={bubble}
          role="tooltip"
          className={cn(
            // whitespace-normal: a trigger inside a nowrap cell (table
            // action columns) otherwise passes nowrap down and the text
            // runs straight past the bubble.
            'bg-surface-elevated border-border-default text-text-muted pointer-events-none absolute z-30 hidden rounded-md border px-3 py-2 text-left text-xs leading-snug font-normal normal-case tracking-normal shadow-popover group-hover/tip:block group-focus-within/tip:block',
            delayed && 'hover-tip-delayed',
            side === 'right'
              ? 'top-1/2 left-full ml-2 w-auto -translate-y-1/2 whitespace-nowrap'
              : // Size to the text, wrap past 224px — a fixed w-56 made
                // a short label a comically wide bubble.
                'w-max max-w-56 whitespace-normal [overflow-wrap:anywhere]',
            side === 'bottom' && 'top-full mt-1.5',
            side === 'top' && 'bottom-full mb-1.5',
            side !== 'right' &&
              align === 'center' &&
              'left-1/2 -translate-x-1/2',
            side !== 'right' && align === 'start' && 'left-0',
            side !== 'right' && align === 'end' && 'right-0',
          )}
        >
          {text}
        </span>
      )}
    </span>
  )
}
