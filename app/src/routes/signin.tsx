import { useState, type FormEvent } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'
import { sessionQueryOptions } from '@/lib/auth'
import { Wordmark } from '@/components/rail'

// Sign in / sign up with email and password (Supabase Auth). No invites,
// no password reset: add them if your deployment needs them.

export const Route = createFileRoute('/signin')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions)
    if (session) throw redirect({ to: '/' })
  },
  component: SignInPage,
})

function authErrorCopy(err: unknown, isSignup: boolean): string {
  const msg = err instanceof Error ? err.message : ''
  const lower = msg.toLowerCase()
  if (lower.includes('rate limit') || lower.includes('too many'))
    return 'Too many attempts. Wait a minute and try again.'
  if (isSignup) {
    if (lower.includes('already') || lower.includes('exists'))
      return 'Check your inbox to confirm your email, then sign in.'
    if (lower.includes('password')) return msg || 'Choose a stronger password.'
    return 'Could not create the account. Try again.'
  }
  return 'Email or password is incorrect.'
}

function SignInPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isSignup = mode === 'signup'

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (isSignup) {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        })
        if (signUpErr) throw signUpErr
        if (!data.session) {
          setError('Check your inbox to confirm your email, then sign in.')
          setMode('signin')
          return
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        if (signInErr) throw signInErr
      }
      await navigate({ to: '/' })
    } catch (err) {
      setError(authErrorCopy(err, isSignup))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10" style={{ background: 'var(--color-bg)' }}>
      <div
        className="bg-surface border-border-default w-full max-w-[420px] rounded-lg border p-8"
        style={{ boxShadow: 'var(--shadow-card-md)' }}
      >
        <div className="mb-[22px]">
          <Wordmark />
        </div>

        <h1 className="text-text mb-1 text-[22px] leading-tight font-bold">
          {isSignup ? 'Create your account' : 'Sign in'}
        </h1>
        <p className="text-text-soft mb-[22px] text-sm">
          {isSignup ? 'An account on this Prompt Tracker.' : 'Welcome back. Use your email and password.'}
        </p>

        {error && (
          <div className="bg-danger-soft text-danger mb-3.5 rounded-md px-3 py-2.5 text-13">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="form-grid" style={{ gap: 14 }}>
          {isSignup && (
            <div className="form-field">
              <label htmlFor="auth-name" className="form-label">
                Your name
              </label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
              />
            </div>
          )}
          <div className="form-field">
            <label htmlFor="auth-email" className="form-label">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-field">
            <label htmlFor="auth-password" className="form-label">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
            />
          </div>
          <button type="submit" disabled={submitting} className="btn btn-primary btn-block mt-1">
            {submitting ? (isSignup ? 'Creating account…' : 'Signing in…') : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="text-text-soft mt-[18px] text-center text-13">
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            className="text-primary cursor-pointer font-medium hover:underline"
            onClick={() => {
              setMode(isSignup ? 'signin' : 'signup')
              setError(null)
            }}
          >
            {isSignup ? 'Sign in' : 'Sign up'}
          </button>
        </div>
      </div>
    </div>
  )
}
