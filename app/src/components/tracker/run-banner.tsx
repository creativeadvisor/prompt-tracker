import { useRunProgress } from '@/lib/tracker-runs'

// The strip above a page while a Run is in flight: units done / total,
// then the outcome. Reads the same progress as the pending cards.

export function RunBanner({ runIds, brandId, onDone }: { runIds: string[]; brandId: string; onDone?: () => void }) {
  const p = useRunProgress(runIds, brandId, onDone)
  if (runIds.length === 0) return null
  const tone = p.allDone ? (p.ok + p.noAnswer > 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger') : 'bg-info-soft text-info'
  return (
    <div role="status" className={`${tone} mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-3 py-2.5 text-13`}>
      <span className="flex items-center gap-2 font-medium">
        {!p.allDone && <span aria-hidden className="bg-info inline-block h-2 w-2 animate-pulse rounded-full" />}
        {p.allDone ? 'Run finished' : 'Running…'}
      </span>
      <span className="font-mono text-xs">
        {p.done}/{p.total || '…'} answers
        {p.ok > 0 && ` · ${p.ok} ok`}
        {p.noAnswer > 0 && ` · ${p.noAnswer} no answer shown`}
        {p.unavailable > 0 && ` · ${p.unavailable} unavailable`}
        {p.failed > 0 && ` · ${p.failed} failed`}
      </span>
      {p.allDone && p.runs.some((r) => r.error) && <span className="text-xs">{p.runs.find((r) => r.error)?.error}</span>}
    </div>
  )
}
