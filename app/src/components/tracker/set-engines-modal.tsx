import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/modal'
import { EnginePicker } from '@/components/tracker/engine-picker'
import { updatePrompt, type TrackedPrompt, type EngineId } from '@/lib/tracker'

/** Apply one set of engines to many prompts (the table's current filter). */
export function SetEnginesModal({
  open,
  onClose,
  prompts,
  initial,
  onDone,
}: {
  open: boolean
  onClose: () => void
  prompts: TrackedPrompt[]
  initial: EngineId[]
  onDone: (n: number) => void
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<EngineId[]>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply() {
    if (draft.length === 0) {
      setError('Pick at least one engine.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      let n = 0
      for (const p of prompts) {
        const same = p.engines.length === draft.length && p.engines.every((e) => draft.includes(e))
        if (same) continue
        await updatePrompt(qc, p, { engines: draft })
        n++
      }
      onDone(n)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the prompts.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Set engines for ${prompts.length} prompt${prompts.length === 1 ? '' : 's'}`}
      description="Replaces each prompt's engines with this set. Past answers are kept."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void apply()} disabled={busy}>
            {busy ? 'Updating…' : 'Apply'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <EnginePicker value={draft} onChange={setDraft} />
        {error && <div className="bg-danger-soft text-danger rounded-md px-3 py-2.5 text-13">{error}</div>}
      </div>
    </Modal>
  )
}
