import { useEffect } from 'react'
import {
  isRedirect,
  Link,
  useRouter,
  type ErrorComponentProps,
} from '@tanstack/react-router'

function FallbackShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid min-h-screen place-items-center px-4"
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="empty-card w-full max-w-[420px] text-center">
        {children}
      </div>
    </div>
  )
}

export function RouterErrorFallback({ error }: ErrorComponentProps) {
  const router = useRouter()

  // A redirect or a CancelledError isn't a real failure — it means a
  // navigation already superseded this route's load (e.g. refreshing /signin
  // while signed in, whose beforeLoad redirects to the dashboard; the cancelled
  // /signin load surfaces here). Re-run the load so it completes cleanly
  // (the session is cached by now) instead of showing a scary error card.
  const transient =
    isRedirect(error) ||
    (error instanceof Error &&
      (error.name === 'CancelledError' || error.message === 'CancelledError'))

  useEffect(() => {
    if (transient) router.invalidate()
  }, [transient, router])

  if (transient) {
    return <RouterPending />
  }

  return (
    <FallbackShell>
      <h3>Something went wrong</h3>
      <p className="text-text-soft text-sm">
        {error instanceof Error ? error.message : 'Unexpected error.'}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => router.invalidate()}
          className="btn btn-primary btn-sm"
        >
          Try again
        </button>
        <Link to="/" className="btn btn-secondary btn-sm">
          Go home
        </Link>
      </div>
    </FallbackShell>
  )
}

export function RouterNotFound() {
  return (
    <FallbackShell>
      <h3>Page not found</h3>
      <p className="text-text-soft text-sm">
        This page doesn't exist or may have moved.
      </p>
      <div className="mt-4 flex justify-center">
        <Link to="/" className="btn btn-primary btn-sm">
          Go home
        </Link>
      </div>
    </FallbackShell>
  )
}

export function RouterPending() {
  return (
    <FallbackShell>
      <p className="text-text-soft text-sm">Loading…</p>
    </FallbackShell>
  )
}
