import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useOverlayBehavior } from '@/lib/overlay'


/**
 * `.modal` — centered overlay with a 55% `--color-backdrop` scrim, bg-surface card,
 *  radius-lg (16px), padding 28px, shadow-lg, max-w 480px (or 640px with `wide`).
 *  Closes on backdrop click and Escape. Focus is moved into the dialog on
 *  open (unless a consumer's autoFocus already did), trapped while open, and
 *  restored to the opener on close; body scroll is locked.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
  xl,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
  /** Double `wide` (1280px) — for form-heavy modals like Publish to
   *  client. Wins over `wide` when both are set. */
  xl?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Keep onClose out of the effect deps — parents pass inline closures, and
  // re-running the focus effect on every parent render would steal focus.
  useOverlayBehavior(open, dialogRef, onClose)

  if (!open) return null

  // Portaled to <body> (a preview catch on a date
  // modal): every .overflow-x-auto scroller carries `contain: paint` (the
  // iOS page-pan fix), which makes it the containing block for fixed
  // descendants AND clips them — so a modal opened from inside a table
  // rendered boxed into the table. The portal escapes every scroll
  // container by construction; React still bubbles events through the
  // tree, so parent stopPropagation handlers behave as before.
  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-5"
      style={{ background: 'color-mix(in srgb, var(--color-backdrop) 55%, transparent)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'bg-surface-elevated border-border-default w-full overflow-y-auto rounded-lg border p-5 shadow-card-lg sm:p-7',
          xl ? 'max-w-[1280px]' : wide ? 'max-w-[640px]' : 'max-w-[480px]',
        )}
        style={{ maxHeight: 'calc(100vh - 40px)' }}
      >
        {title && (
          <h3 id={titleId} className="text-text mb-1.5 text-lg font-semibold">
            {title}
          </h3>
        )}
        {description && (
          <p className="text-text-muted mb-[18px] text-sm">{description}</p>
        )}
        {children}
        {footer && (
          <div className="mt-[18px] flex flex-wrap items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * In-app replacement for `window.confirm()` on destructive actions — the
 * native dialog leaks the deployment hostname and ignores the design
 * system. Handles an async `onConfirm` itself: busy state while pending,
 * closes on success, shows the error and stays open on failure (Escape /
 * backdrop / Cancel are inert while busy). Cancel gets initial focus, so
 * Enter never destroys anything by default.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  busyLabel = 'Deleting…',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message?: React.ReactNode
  confirmLabel?: string
  busyLabel?: string
  cancelLabel?: string
  /** false = non-destructive confirm (primary button instead of danger). */
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Every close path resets local state, so the next open starts fresh
  // (an effect-based reset would trip react-hooks/set-state-in-effect).
  function close() {
    setBusy(false)
    setError(null)
    onClose()
  }

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      close()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      )
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : close}
      title={title}
      description={message}
      footer={
        <>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="btn btn-secondary btn-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={cn('btn btn-sm', danger ? 'btn-danger' : 'btn-primary')}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      {error && (
        <div className="bg-danger-soft text-danger rounded-md px-3 py-2 text-sm">
          {error}
        </div>
      )}
    </Modal>
  )
}
