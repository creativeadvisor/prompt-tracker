import { Fragment } from 'react'
import type { BrandProfile } from '@/lib/tracker'
import { RequireBrand } from '@/components/brand-switcher'
import { PageContainer, PageHeader } from '@/components/page-shell'

// The frame every page shares: the header, then — once a brand is in
// scope — the page's body for that brand, keyed on it so local state
// starts fresh per brand.

export function TrackerPage({
  title,
  subtitle,
  trailing,
  children,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
  children: (brand: BrandProfile) => React.ReactNode
}) {
  return (
    <PageContainer>
      <PageHeader title={title} subtitle={subtitle} trailing={trailing} />
      <RequireBrand>{(brand) => <Fragment key={brand.id}>{children(brand)}</Fragment>}</RequireBrand>
    </PageContainer>
  )
}
