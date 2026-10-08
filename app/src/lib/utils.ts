import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge has to know the design's own type scale (index.css @theme
// --text-10/11/13/15/17/22). Unregistered, it reads `text-13` as a text
// COLOR and drops it the moment a real color joins it in cn() — "text-13"
// plus "text-inverse-fg" would render at the inherited size. Add a size
// here whenever the scale grows.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['10', '11', '13', '15', '17', '22'] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Make a clickable row/card keyboard-accessible: focusable, announced as a
 * link, activated with Enter/Space. Keyboard activation only fires when the
 * row itself is focused, so Enter on an inner button doesn't also navigate
 * (inner buttons still need stopPropagation for mouse clicks, as before).
 */
export function rowLinkProps(onActivate: () => void) {
  return {
    role: 'link' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
  }
}

/**
 * A stored URL fit for an `href`: http(s) or mailto only. React escapes
 * TEXT, not schemes — a value like `javascript:…` rendered into an anchor
 * runs on click, and citation URLs come from answer engines, not from the
 * user. Anything else returns undefined, so the anchor renders inert.
 */
export function safeHref(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const v = value.trim()
  if (/^mailto:[^\s]+$/i.test(v)) return v
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:' ? v : undefined
  } catch {
    return undefined
  }
}
