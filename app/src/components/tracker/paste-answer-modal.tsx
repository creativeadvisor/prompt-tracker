import { useState } from 'react'
import { Modal } from '@/components/modal'
import { submitManualAnswer } from '@/lib/tracker'

// Paste an answer you got elsewhere (Perplexity, Google AI Mode, a
// screenshot transcribed) — stored as the `manual` engine and analysed
// like any fetched one.

export function PasteAnswerModal({
  open,
  onClose,
  brandId,
  promptId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  brandId: string
  promptId: string
  onSaved: (runId: string) => void
}) {
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (text.trim().length < 20) {
      setError('Paste the whole answer (at least 20 characters).')
      return
    }
    setBusy(true)
    try {
      const { runId } = await submitManualAnswer(brandId, promptId, text, source)
      setText('')
      setSource('')
      onSaved(runId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the answer.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Paste an answer"
      description="An answer from an engine we don't fetch yet, as the engine gave it."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : 'Save answer'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="pa-source" className="form-label">
            Where it came from
          </label>
          <input
            id="pa-source"
            className="form-input"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Perplexity, Google AI Mode, …"
            maxLength={60}
          />
        </div>
        <div className="form-field">
          <label htmlFor="pa-text" className="form-label">
            The answer
          </label>
          <textarea id="pa-text" className="form-textarea" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {error && <div className="bg-danger-soft text-danger rounded-md px-3 py-2.5 text-13">{error}</div>}
      </div>
    </Modal>
  )
}
