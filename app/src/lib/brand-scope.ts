import { createContext, useContext } from 'react'

// One answer to "which brand?" app-wide. The rail's switcher sets it and
// every page reads it; persisted per browser so a reload keeps the choice.

const STORAGE_KEY = 'prompt-tracker:brand'

export interface BrandScope {
  /** The brand in scope, or null when none is chosen yet. */
  brandId: string | null
  setBrandId: (id: string | null) => void
}

export const BrandScopeContext = createContext<BrandScope | null>(null)

export function useBrandScope(): BrandScope {
  const ctx = useContext(BrandScopeContext)
  if (!ctx) throw new Error('useBrandScope requires BrandScopeProvider')
  return ctx
}

export function readStoredBrandId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function writeStoredBrandId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* private mode etc. — the choice just won't persist */
  }
}
