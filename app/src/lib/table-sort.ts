import { useState } from 'react'

// Column sorting for tables: every table sorts, and new tables include it
// by default.
// Logic lives here in lib/ so components/table.tsx stays components-only
// (react-refresh); the matching header cell is that module's SortTh.
//
// Values may be strings (case-insensitive), numbers, or null — null
// ALWAYS sorts last regardless of direction (an unknown date is not
// "oldest", it's unknown).

export type SortDir = 'asc' | 'desc'
export interface SortState {
  key: string
  dir: SortDir
}

export function useSort(defaultKey: string, defaultDir: SortDir = 'asc') {
  const [sort, setSort] = useState<SortState>({
    key: defaultKey,
    dir: defaultDir,
  })
  function toggle(key: string, firstDir: SortDir = 'asc') {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: firstDir },
    )
  }
  return { sort, toggle }
}

export function sortRows<T>(
  rows: T[],
  sort: SortState,
  accessors: Record<string, (row: T) => string | number | null>,
): T[] {
  const get = accessors[sort.key]
  if (!get) return rows
  const mul = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'string' && typeof vb === 'string')
      return mul * va.localeCompare(vb, undefined, { sensitivity: 'base' })
    return mul * (Number(va) - Number(vb))
  })
}
