import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { TrackerPage } from '@/components/tracker/tracker-page'
import { ProfileForm } from '@/components/tracker/profile-form'
import { ConfirmDialog } from '@/components/modal'
import { Panel } from '@/components/page-shell'
import { deleteBrand, type BrandProfile } from '@/lib/tracker'
import { useBrandScope } from '@/lib/brand-scope'

// Settings — the brand profile: who "the brand" is in an answer, its
// domains, the competitors it is measured against, the market, the default
// engines. And the one destructive action: deleting the brand.

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  return (
    <TrackerPage title="Settings" subtitle="The brand profile the extract layer and the judge read.">
      {(brand) => <SettingsBody brand={brand} />}
    </TrackerPage>
  )
}

function SettingsBody({ brand }: { brand: BrandProfile }) {
  const qc = useQueryClient()
  const { setBrandId } = useBrandScope()
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <ProfileForm key={brand.id} qc={qc} profile={brand} />
      <Panel title="Danger zone" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-text-soft text-sm">
            Deleting <span className="text-text font-medium">{brand.brandName}</span> removes its prompts, runs,
            answers and analyses. This cannot be undone.
          </p>
          <button type="button" className="btn btn-secondary btn-danger" onClick={() => setConfirming(true)}>
            Delete brand
          </button>
        </div>
      </Panel>
      <ConfirmDialog
        open={confirming}
        title={`Delete ${brand.brandName}?`}
        message="Every prompt, run, answer and analysis for this brand goes with it."
        confirmLabel="Delete brand"
        danger
        onConfirm={async () => {
          await deleteBrand(qc, brand.id)
          setBrandId(null)
          setConfirming(false)
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
