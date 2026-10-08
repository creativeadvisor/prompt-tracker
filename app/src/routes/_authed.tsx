import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { sessionQueryOptions } from '@/lib/auth'
import { brandsQueryOptions } from '@/lib/tracker'
import { TRACKER_GROUP } from '@/lib/nav'
import { AppShell } from '@/components/rail'
import { BrandScopeProvider, BrandSwitcher } from '@/components/brand-switcher'

// The signed-in layout: no session → /signin; otherwise the rail (with the
// brand switcher) around one child route per page.

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions)
    if (!session) throw redirect({ to: '/signin' })
    return { session }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(brandsQueryOptions),
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <BrandScopeProvider>
      <AppShell items={[TRACKER_GROUP]} scopeSlot={<BrandSwitcher />}>
        <Outlet />
      </AppShell>
    </BrandScopeProvider>
  )
}
