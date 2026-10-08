import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { registerAuthListener } from './lib/auth'
import {
  RouterErrorFallback,
  RouterNotFound,
  RouterPending,
} from './components/router-fallbacks'
import './index.css'
import './lib/theme' // applies the stored theme class on <html>; see lib/theme.ts

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

registerAuthListener(queryClient)

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultErrorComponent: RouterErrorFallback,
  defaultNotFoundComponent: RouterNotFound,
  defaultPendingComponent: RouterPending,
  context: { queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
