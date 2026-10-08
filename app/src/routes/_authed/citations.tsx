import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { TrackerPage } from '@/components/tracker/tracker-page'
import { FilterBar, FilterChip } from '@/components/filter-chip'
import { SortTh } from '@/components/table'
import { RowCard, RowCardList } from '@/components/row-cards'
import { Badge } from '@/components/badges'
import { sortRows, useSort } from '@/lib/table-sort'
import { safeHref } from '@/lib/utils'
import {
  brandResultsQueryOptions,
  domainTable,
  engineLabel,
  latestByPromptEngine,
  profileQueryOptions,
  type CitationOwner,
  type DomainRow,
  type BrandProfile,
} from '@/lib/tracker'

// Citations — the sources answer engines cite for this brand's prompts,
// by domain, with who owns each one (the brand, a competitor, a third
// party). The ownership class is what makes the list actionable:
// third-party domains that engines trust are where earned media lands.

export const Route = createFileRoute('/_authed/citations')({
  component: CitationsPage,
})

const OWNER_LABEL: Record<CitationOwner, string> = {
  brand: 'Brand-owned',
  competitor: 'Competitor-owned',
  third_party: 'Third party',
}

function OwnerPill({ row }: { row: DomainRow }) {
  const cls = row.owner === 'brand' ? 'bg-agent-soft text-agent' : row.owner === 'competitor' ? 'bg-warm-soft text-warm' : 'bg-surface-2 text-text-muted'
  return (
    <span className={`${cls} inline-flex items-center rounded-full px-[9px] py-[3px] text-11 font-semibold tracking-[0.2px] whitespace-nowrap`}>
      {row.owner === 'competitor' && row.ownerName ? row.ownerName : OWNER_LABEL[row.owner]}
    </span>
  )
}

function CitationsPage() {
  return (
    <TrackerPage
      title="Citations"
      subtitle="The sources answer engines cite for your tracked prompts, by domain."
    >
      {(brand) => <CitationsBody brand={brand} />}
    </TrackerPage>
  )
}

function CitationsBody({ brand }: { brand: BrandProfile }) {
  const results = useQuery(brandResultsQueryOptions(brand.id))
  const profile = useQuery(profileQueryOptions(brand.id))
  const [owner, setOwner] = useState<CitationOwner | null>(null)
  const { sort, toggle } = useSort('citations', 'desc')

  const rows = useMemo(() => {
    const latest = [...latestByPromptEngine(results.data ?? []).values()]
    return domainTable(latest, profile.data ?? null)
  }, [results.data, profile.data])
  const counts = useMemo(() => {
    const c: Record<CitationOwner, number> = { brand: 0, competitor: 0, third_party: 0 }
    for (const r of rows) c[r.owner]++
    return c
  }, [rows])
  const visible = useMemo(
    () =>
      sortRows(
        rows.filter((r) => !owner || r.owner === owner),
        sort,
        {
          domain: (r) => r.domain,
          owner: (r) => (r.owner === 'competitor' ? r.ownerName ?? 'competitor' : OWNER_LABEL[r.owner]),
          citations: (r) => r.citations,
          prompts: (r) => r.prompts,
          position: (r) => r.meanPosition,
        },
      ),
    [rows, owner, sort],
  )
  const total = rows.reduce((n, r) => n + r.citations, 0)

  if (results.isPending) return <p className="text-text-soft text-sm">Loading…</p>
  if (results.isError) return <p className="text-danger text-sm">Could not load answers: {results.error.message}</p>
  if (rows.length === 0)
    return (
      <div className="empty-card">
        <h3>No citations yet</h3>
        <p className="text-text-soft text-sm">Run prompts on an engine that cites sources, and the domains show up here.</p>
      </div>
    )

  return (
    <>
      <FilterBar>
        <FilterChip active={owner === null} count={rows.length} onClick={() => setOwner(null)}>
          All domains
        </FilterChip>
        {(['third_party', 'brand', 'competitor'] as const).map((k) => (
          <FilterChip key={k} active={owner === k} count={counts[k]} onClick={() => setOwner(owner === k ? null : k)}>
            {OWNER_LABEL[k]}
          </FilterChip>
        ))}
        <span className="text-text-soft ml-auto font-mono text-11">{total} citations across the latest answers</span>
      </FilterBar>

      <div className="bg-surface border-border-default hidden overflow-x-auto rounded-md border md:block" style={{ contain: 'paint' }}>
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr>
              <SortTh label="Domain" k="domain" sort={sort} onToggle={toggle} />
              <SortTh label="Owner" k="owner" sort={sort} onToggle={toggle} />
              <SortTh label="Citations" k="citations" sort={sort} onToggle={toggle} firstDir="desc" />
              <SortTh label="Prompts" k="prompts" sort={sort} onToggle={toggle} firstDir="desc" />
              <SortTh label="Avg position" k="position" sort={sort} onToggle={toggle} />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const href = safeHref(r.sample.url)
              return (
                <tr key={r.domain} className="border-border-default border-b last:border-b-0 align-top">
                  <td className="px-4 py-3">
                    <span className="text-text block font-medium">{r.domain}</span>
                    <span className="text-text-soft block max-w-[420px] truncate text-xs">
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer noopener" className="hover:text-accent-deep inline-flex items-center gap-1">
                          <span className="truncate">{r.sample.title || r.sample.url}</span>
                          <ExternalLink aria-hidden size={11} className="shrink-0" />
                        </a>
                      ) : (
                        r.sample.title || r.sample.url
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {r.engines.map((e) => (
                        <Badge key={e}>{engineLabel(e)}</Badge>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <OwnerPill row={r} />
                  </td>
                  <td className="text-text px-4 py-3 font-mono text-xs">
                    {r.citations}
                    <span className="text-text-soft"> · {total ? Math.round((100 * r.citations) / total) : 0}%</span>
                  </td>
                  <td className="text-text px-4 py-3 font-mono text-xs">{r.prompts}</td>
                  <td className="text-text-muted px-4 py-3 font-mono text-xs">{r.meanPosition ? r.meanPosition.toFixed(1) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="md:hidden">
        <RowCardList>
          {visible.map((r) => (
            <RowCard key={r.domain} title={r.domain} sub={r.sample.title || r.sample.url} pill={<OwnerPill row={r} />} meta={`${r.citations} citations · ${r.prompts} prompts`} />
          ))}
        </RowCardList>
      </div>
    </>
  )
}
