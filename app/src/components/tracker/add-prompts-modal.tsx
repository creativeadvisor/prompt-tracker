import { useState } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/modal'
import { Tabs } from '@/components/tabs'
import { EnginePicker } from '@/components/tracker/engine-picker'
import {
  cleanPromptText,
  createPrompts,
  splitList,
  type BrandProfile,
  type EngineId,
} from '@/lib/tracker'

// Add prompts — one, or a pasted list (one per line; bullets and numbering
// stripped). Tags and engines apply to every prompt in the batch; engines
// default to the profile's.

type Mode = 'single' | 'bulk'

export function AddPromptsModal({
  open,
  onClose,
  qc,
  brandId,
  profile,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  qc: QueryClient
  brandId: string
  profile: BrandProfile | null
  onCreated: (n: number, skipped: number) => void
}) {
  const [mode, setMode] = useState<Mode>('single')
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [engines, setEngines] = useState<EngineId[]>(profile?.defaultEngines ?? ['mock'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lines =
    mode === 'bulk'
      ? text.split('\n').map(cleanPromptText).filter((l) => l.length >= 3)
      : [cleanPromptText(text)].filter((l) => l.length >= 3)

  async function submit() {
    setError(null)
    if (lines.length === 0) {
      setError('Type at least one prompt.')
      return
    }
    if (engines.length === 0) {
      setError('Pick at least one engine.')
      return
    }
    setBusy(true)
    try {
      const { created, skipped } = await createPrompts(
        qc,
        brandId,
        lines.map((promptText) => ({ promptText, tags: splitList(tags), engines })),
      )
      onCreated(created.length, skipped)
      setText('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the prompts.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add prompts"
      description="The questions people ask answer engines that this brand should appear in."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Adding…' : lines.length > 1 ? `Add ${lines.length} prompts` : 'Add prompt'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Tabs
          value={mode}
          onChange={setMode}
          variant="underline"
          label="How to add"
          options={[
            { k: 'single', label: 'One prompt' },
            { k: 'bulk', label: 'Paste a list' },
          ]}
        />
        <div className="form-field">
          <label htmlFor="ap-text" className="form-label">
            {mode === 'bulk' ? 'Prompts, one per line' : 'Prompt'}
          </label>
          <textarea
            id="ap-text"
            className="form-textarea"
            rows={mode === 'bulk' ? 8 : 3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === 'bulk'
                ? 'best coffee subscription for small offices\nhow much does a coffee subscription cost\n…'
                : 'best coffee subscription for small offices'
            }
          />
          {mode === 'bulk' && (
            <span className="form-hint">{lines.length} prompt{lines.length === 1 ? '' : 's'} detected. Bullets and numbers are stripped.</span>
          )}
        </div>
        <div className="form-field">
          <label htmlFor="ap-tags" className="form-label">
            Tags
          </label>
          <input
            id="ap-tags"
            className="form-input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="category, pricing"
          />
          <span className="form-hint">Comma-separated. Applied to every prompt added here.</span>
        </div>
        <fieldset className="form-field">
          <legend className="form-label">Engines</legend>
          <EnginePicker value={engines} onChange={setEngines} />
        </fieldset>
        {error && <div className="bg-danger-soft text-danger rounded-md px-3 py-2.5 text-13">{error}</div>}
      </div>
    </Modal>
  )
}
