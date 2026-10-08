import { useEffect, useRef } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { invalidateAfterRun, runQueryOptions, type Run, type RunUnit } from './tracker'

// Watching the runs a Run click started (the app polls the runs table).
// One hook for the banner and the Responses tab's pending cards, so both
// read the same progress.

export interface RunProgress {
  runs: Run[]
  /** Every run row has loaded and none is still running. */
  allDone: boolean
  /** At least one of the watched runs is still running. */
  running: boolean
  /** Units the runs will produce, with the outcome once it exists. */
  units: Array<{ promptId: string; engine: string; outcome: RunUnit | null }>
  done: number
  total: number
  ok: number
  failed: number
  unavailable: number
  noAnswer: number
}

export function useRunProgress(runIds: string[], brandId: string, onDone?: () => void): RunProgress {
  const qc = useQueryClient()
  const results = useQueries({ queries: runIds.map((id) => runQueryOptions(id)) })
  const runs = results.map((r) => r.data).filter((r): r is Run => !!r)
  const loaded = runIds.length > 0 && runs.length === runIds.length
  const running = runs.some((r) => r.status === 'running') || (runIds.length > 0 && !loaded)
  const allDone = loaded && !running

  const units: RunProgress['units'] = []
  for (const r of runs) {
    // The run's input names its prompts and engines; its output fills in
    // outcomes as units finish. unit_count is the truth for the total.
    const outcomes = r.units
    const seen = new Set<string>()
    for (const o of outcomes) {
      units.push({ promptId: o.prompt_id, engine: o.engine, outcome: o })
      seen.add(`${o.prompt_id}:${o.engine}`)
    }
    for (const p of r.promptIds) {
      for (const e of r.engines) {
        const k = `${p}:${e}`
        if (!seen.has(k) && units.filter((u) => u.outcome === null).length + outcomes.length < r.unitCount) {
          units.push({ promptId: p, engine: e, outcome: null })
          seen.add(k)
        }
      }
    }
  }
  const outcomes = units.map((u) => u.outcome).filter((o): o is RunUnit => !!o)

  // Fire once per set of run ids — not on mount with none, and again for
  // the next Run click (the first version fired on the empty mount and
  // never again, so results needed a page change to appear).
  const firedFor = useRef<string | null>(null)
  const key = runIds.join(',')
  useEffect(() => {
    if (!allDone || !key || firedFor.current === key) return
    firedFor.current = key
    invalidateAfterRun(qc, brandId)
    onDone?.()
  }, [allDone, key, qc, brandId, onDone])

  return {
    runs,
    allDone,
    running,
    units,
    done: outcomes.length,
    total: runs.reduce((n, r) => n + r.unitCount, 0),
    ok: outcomes.filter((o) => o.status === 'ok').length,
    failed: outcomes.filter((o) => o.status === 'failed').length,
    unavailable: outcomes.filter((o) => o.status === 'unavailable').length,
    noAnswer: outcomes.filter((o) => o.status === 'no_answer').length,
  }
}
