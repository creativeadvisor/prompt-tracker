import { queryOptions, type QueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Auth is Supabase Auth, nothing more: the session query the routes gate
// on, sign-out, and a listener that keeps the query in step with the SDK.

export const sessionQueryOptions = queryOptions({
  queryKey: ['session'],
  queryFn: async (): Promise<Session | null> => {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return data.session
  },
  staleTime: Infinity,
})

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export function registerAuthListener(queryClient: QueryClient): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) queryClient.removeQueries()
    queryClient.setQueryData(sessionQueryOptions.queryKey, session)
  })
  return () => data.subscription.unsubscribe()
}
