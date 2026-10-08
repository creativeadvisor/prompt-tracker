import { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { TrackerPage } from '@/components/tracker/tracker-page'
import { TrendChart } from '@/components/tracker/trend-chart'
import { StatsRow, StatCard } from '@/components/stats'
import { Panel } from '@/components/page-shell'
import { Th } from '@/components/table'
import {
  byEngine,
  engineLabel,
  feedQueryOptions,
  headline,
  latestFeed,
  profileQueryOptions,
  promptsQueryOptions,
  STANCE_LABELS,
  trend,
  type StanceLabel,
  type BrandProfile,
} from '@/lib/tracker'

// Overview: the headline for the brand in scope — visibility, share of voice, stance, prompts tracked — then how
// each engine treats the brand, and the two trends. Every number comes
// from stored analyses (nothing is recomputed on render).

export const Route = createFileRoute('/_authed/')({
  component: OverviewPage,
})

function OverviewPage() {
  return (
    <TrackerPage title="Overview" subtitle="What are answer engines saying about your brand?">
      {(brand) => <OverviewBody brand={brand} />}
    </TrackerPage>
  )
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '—')
const stanceWord = (mean: number | null): StanceLabel | null => {
  if (mean === null) return null
  if (mean >= 0.75) return 'strongly_positive'
  if (mean >= 0.25) return 'positive'
  if (mean > -0.25) return 'neutral'
  if (mean > -0.75) return 'negative'
  return 'strongly_negative'
}
const fmtStance = (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))

function OverviewBody({ brand }: { brand: BrandProfile }) {
  const feed = useQuery(feedQueryOptions(brand.id))
  const prompts = useQuery(promptsQueryOptions(brand.id))
  const profile = useQuery(profileQueryOptions(brand.id))
  const latest = useMemo(() => latestFeed((feed.data ?? []).filter((r) => r.status === 'ok')), [feed.data])
  const head = useMemo(() => headline(latest), [latest])
  const engines = useMemo(() => byEngine(latest), [latest])
  const points = useMemo(() => trend((feed.data ?? []).filter((r) => r.status === 'ok')), [feed.data])

  if (feed.isPending || prompts.isPending) return <p className="text-text-soft text-sm">Loading…</p>
  if (feed.isError) return <p className="text-danger text-sm">Could not load analyses: {feed.error.message}</p>

  const promptCount = (prompts.data ?? []).filter((p) => p.status === 'active').length
  if (latest.length === 0)
    return (
      <div className="empty-card">
        <h3>{promptCount ? 'No answers analysed yet' : 'No prompts yet'}</h3>
        <p className="text-text-soft text-sm">
          {promptCount ? 'Run the prompts and the overview fills in as answers are judged.' : 'Add the questions this brand should show up in, then run them.'}
        </p>
        <div className="mt-4 flex justify-center">
          <Link to="/prompts" className="btn btn-primary">
            {promptCount ? 'Go to prompts' : 'Add prompts'}
          </Link>
        </div>
      </div>
    )

  const sov = head.shareOfVoice
  const sovTotal = sov.brand + sov.competitors
  const sovRows = [
    { name: profile.data?.brandName ?? brand.brandName, n: sov.brand, brand: true },
    ...Object.entries(sov.byCompetitor)
      .map(([name, n]) => ({ name, n, brand: false }))
      .sort((a, b) => b.n - a.n),
  ]
  const stanceLabel = stanceWord(head.stance.mean)

  return (
    <>
      <StatsRow>
        <StatCard
          label="Visibility"
          value={pct(head.visibility.mentioned, head.visibility.answered)}
          trend={`${head.visibility.mentioned} of ${head.visibility.answered} answered prompts name the brand`}
        />
        <StatCard label="Share of voice" value={pct(sov.brand, sovTotal)} trend={`${sov.brand} brand mentions vs ${sov.competitors} competitor mentions`} />
        <StatCard
          label="Stance"
          value={stanceLabel ? STANCE_LABELS[stanceLabel] : '—'}
          trend={head.stance.mean !== null ? `${fmtStance(head.stance.mean)} across ${head.stance.n} answer${head.stance.n === 1 ? '' : 's'}` : 'Not yet named in an answer'}
        />
        <StatCard
          label="Avg position"
          value={head.rank.mean !== null ? `#${head.rank.mean.toFixed(1)}` : '—'}
          trend={head.rank.mean !== null ? `among named providers, ${head.rank.n} answer${head.rank.n === 1 ? '' : 's'}` : `${promptCount} prompt${promptCount === 1 ? '' : 's'} tracked`}
        />
      </StatsRow>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="By engine">
          <div className="overflow-x-auto" style={{ contain: 'paint' }}>
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr>
                  <Th>Engine</Th>
                  <Th>Answers</Th>
                  <Th>Mentioned</Th>
                  <Th>Stance</Th>
                  <Th>Avg position</Th>
                </tr>
              </thead>
              <tbody>
                {engines.map((e) => {
                  const w = stanceWord(e.meanStance)
                  return (
                    <tr key={e.engine} className="border-border-default border-b last:border-b-0">
                      <td className="text-text px-4 py-2.5 font-medium">{engineLabel(e.engine)}</td>
                      <td className="text-text-muted px-4 py-2.5 font-mono text-xs">{e.answers}</td>
                      <td className="text-text px-4 py-2.5 font-mono text-xs">{pct(e.mentioned, e.answers)}</td>
                      <td className="text-text-muted px-4 py-2.5 text-13">{w ? STANCE_LABELS[w] : '—'}</td>
                      <td className="text-text-muted px-4 py-2.5 font-mono text-xs">{e.meanRank !== null ? `#${e.meanRank.toFixed(1)}` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Share of voice">
          {sovTotal === 0 ? (
            <p className="text-text-soft text-13">No brand or competitor named in the latest answers.</p>
          ) : (
            <ol className="flex flex-col gap-2.5" aria-label="Mentions in the latest answers">
              {sovRows.map((r) => (
                <li key={r.name} className="grid grid-cols-[minmax(0,160px)_1fr_auto] items-center gap-3 text-13">
                  <span className={`truncate ${r.brand ? 'text-text font-semibold' : 'text-text-muted'}`}>{r.name}</span>
                  <span className="bg-surface-2 h-2 overflow-hidden rounded-[2px]">
                    <span
                      className={`block h-full rounded-[2px] ${r.brand ? 'bg-chart-1' : 'bg-text-soft'}`}
                      style={{ width: `${sovTotal ? (100 * r.n) / sovTotal : 0}%` }}
                    />
                  </span>
                  <span className="text-text text-right font-mono text-xs whitespace-nowrap tabular-nums">
                    {r.n} · {pct(r.n, sovTotal)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TrendChart title="Visibility" points={points} value={(p) => p.visibility} format={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
        <TrendChart title="Stance" points={points} value={(p) => p.stance} format={fmtStance} domain={[-1, 1]} />
      </div>
    </>
  )
}
