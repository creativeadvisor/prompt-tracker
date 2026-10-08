import { useSyncExternalStore } from 'react'

// The color theme. A module store: a per-browser preference, not account
// state. The default is SYSTEM — the OS setting is where people have
// already said what they need; Dark and Light are explicit choices. The
// class goes on <html> so every route, authed or not, and every portaled
// overlay inherit it; the tokens in index.css (`:root, html.dark` /
// `html.light`) do the rest — no component ever branches on the theme.
//
// index.html carries a pre-paint copy of `resolve()` so the first frame is
// already the right theme; this module takes over from there.

export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'prompt-tracker:theme'

const osLight =
  typeof matchMedia === 'function'
    ? matchMedia('(prefers-color-scheme: light)')
    : null

function readStored(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(pref: ThemePref): Theme {
  if (pref === 'system') return osLight?.matches ? 'light' : 'dark'
  return pref
}

let pref: ThemePref = readStored()
const listeners = new Set<() => void>()

function apply(theme: Theme) {
  const html = document.documentElement
  html.classList.toggle('dark', theme === 'dark')
  html.classList.toggle('light', theme === 'light')
  // The browser chrome color follows the page: read the live token so
  // index.html never duplicates a hex.
  const bg = getComputedStyle(html).getPropertyValue('--t-bg').trim()
  if (bg) {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', bg)
  }
}

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // private mode / blocked storage: the session still switches
  }
  apply(resolveTheme(pref))
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** The stored preference (what the Appearance control shows). */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, () => pref, () => 'system')
}

// "System" follows the OS live.
osLight?.addEventListener('change', () => {
  if (pref === 'system') apply(resolveTheme(pref))
})

// Print always renders the light theme: light text on a dark page prints
// as nothing on white paper. Restored after the print dialog closes.
window.addEventListener('beforeprint', () => apply('light'))
window.addEventListener('afterprint', () => apply(resolveTheme(pref)))

apply(resolveTheme(pref))
