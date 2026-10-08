import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { EnginePicker } from '@/components/tracker/engine-picker'
import { engineLabel, updatePrompt, type TrackedPrompt, type EngineId } from '@/lib/tracker'

/** Inline editor for one prompt's engines (the prompt page header). */
export function EnginesEditor({ prompt }: { prompt: TrackedPrompt }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EngineId[]>(prompt.engines)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (draft.length === 0) {
      setError('Pick at least one engine.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await updatePrompt(qc, prompt, { engines: draft })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  if (!editing)
    return (
      <button
        type="button"
        className="text-text-muted hover:text-text inline-flex items-center gap-1.5 text-13"
        onClick={() => {
          setDraft(prompt.engines)
          setEditing(true)
        }}
      >
        {prompt.engines.map(engineLabel).join(' · ') || 'No engines'}
        <Pencil aria-hidden size={12} />
        <span className="sr-only">Edit engines</span>
      </button>
    )
  return (
    <span className="flex flex-col gap-2">
      <EnginePicker value={draft} onChange={setDraft} />
      <span className="flex items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save engines'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </button>
        {error && <span className="text-danger text-13">{error}</span>}
      </span>
    </span>
  )
}
