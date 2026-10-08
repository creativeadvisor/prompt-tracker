import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import { HoverTip } from '@/components/hover-tip'
import { saveSchedule, scheduleQueryOptions, type ScheduleFrequency } from '@/lib/tracker'

// The brand's recurring run, shipped with its runner (run_due() via
// pg_cron). Changing the frequency resets the next run to one period from
// now.

export function ScheduleControl({ brandId }: { brandId: string }) {
  const qc = useQueryClient()
  const schedule = useQuery(scheduleQueryOptions(brandId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const value = schedule.data?.frequency ?? ''

  async function change(next: string) {
    setError(null)
    setBusy(true)
    try {
      await saveSchedule(qc, brandId, (next || null) as ScheduleFrequency | null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the schedule.')
    } finally {
      setBusy(false)
    }
  }

  const next = schedule.data ? new Date(schedule.data.nextRunAt) : null
  return (
    <span className="flex items-center gap-2">
      <HoverTip text={next ? `Next scheduled run ${next.toLocaleString()}` : 'Run every prompt on its engines on a schedule'}>
        <label className="text-text-muted flex items-center gap-1.5 text-13">
          <CalendarClock aria-hidden size={15} />
          <span className="sr-only">Schedule</span>
          <select
            aria-label="Run schedule"
            className="form-select py-1.5 text-13"
            value={value}
            disabled={busy || schedule.isPending}
            onChange={(e) => void change(e.target.value)}
          >
            <option value="">No schedule</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every two weeks</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </HoverTip>
      {next && <span className="text-text-soft font-mono text-11">next {next.toLocaleDateString()}</span>}
      {error && <span className="text-danger text-11">{error}</span>}
    </span>
  )
}
