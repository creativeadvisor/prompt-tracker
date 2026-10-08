import { useMemo, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ClipboardPaste, Play } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/page-shell'
import { Badge } from '@/components/badges'
import { Tabs } from '@/components/tabs'
import { SortTh, Th } from '@/components/table'
import { AnswerCard, AnswerSkeleton } from '@/components/tracker/answer-card'
import { AnswerDiff } from '@/components/tracker/answer-diff'
import { EnginesEditor } from '@/components/tracker/engines-editor'
import { PasteAnswerModal } from '@/components/tracker/paste-answer-modal'
import { RunBanner } from '@/components/tracker/run-banner'
import { SentimentPanel, StancePill } from '@/components/tracker/sentiment-panel'
import { sortRows, useSort } from '@/lib/table-sort'
import {
  analysesQueryOptions,
  engineLabel,
  invalidateAfterRun,
  isEngineId,
  profileQueryOptions,
  reanalyze,
  promptResultsQueryOptions,
  promptsQueryOptions,
  runsQueryOptions,
  stanceOf,
  startRuns,
  type TrackedPrompt,
  type AnswerResult,
  type Run,
  type EngineId,
} from '@/lib/tracker'
import { useBrandScope } from '@/lib/brand-scope'
import { useRunProgress } from '@/lib/tracker-runs'

// Prompt detail: Responses (the latest answer per engine, with earlier runs
// behind a picker) · Sentiment · History (every run that touched this
// prompt). Run and Paste an answer sit in the header.

type Tab = 'responses' | 'sentiment' | 'history'

export const Route = createFileRoute('/_authed/prompts_/$promptId')({
  component: PromptDetailPage,
})

function PromptDetailPage() {
  const { promptId } = Route.useParams()
  const { brandId } = useBrandScope()
  const prompts = useQuery({ ...promptsQueryOptions(brandId ?? ''), enabled: !!brandId })
  const prompt = prompts.data?.find((p) => p.id === promptId)

  return (
    <PageContainer>
      <Link to="/prompts" className="text-text-muted hover:text-text mb-3 inline-flex items-center gap-1 text-13 no-underline">
        <ArrowLeft aria-hidden size={14} /> All prompts
      </Link>
      {!brandId ? (
        <div className="empty-card">
          <h3>Select a brand</h3>
        </div>
      ) : prompts.isPending ? (
        <p className="text-text-soft text-sm">Loading…</p>
      ) : !prompt ? (
        <div className="empty-card">
          <h3>Prompt not found</h3>
          <p className="text-text-soft text-sm">It may belong to another brand, or it was deleted.</p>
        </div>
      ) : (
        <PromptDetail key={prompt.id} prompt={prompt} />
      )}
    </PageContainer>
  )
}

function PromptDetail({ prompt }: { prompt: TrackedPrompt }) {
  const qc = useQueryClient()
  const profile = useQuery(profileQueryOptions(prompt.brandId))
  const results = useQuery(promptResultsQueryOptions(prompt.id))
  const runs = useQuery(runsQueryOptions(prompt.brandId))
  const [tab, setTab] = useState<Tab>('responses')
  const [pasting, setPasting] = useState(false)
  const [watching, setWatching] = useState<string[]>([])
  const [runError, setRunError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const names = useMemo(
    () => (profile.data ? [profile.data.brandName, ...profile.data.aliases] : []),
    [profile.data],
  )

  const progress = useRunProgress(watching, prompt.brandId)
  const pendingEngines = progress.units.filter((u) => u.outcome === null && u.promptId === prompt.id).map((u) => u.engine)

  async function run(engines?: EngineId[]) {
    setRunError(null)
    setStarting(true)
    try {
      const { runIds } = await startRuns([prompt], prompt.brandId, engines)
      setWatching(runIds)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Could not start the run.')
    } finally {
      setStarting(false)
    }
  }

  const promptRuns = (runs.data ?? []).filter((r) => r.promptIds.includes(prompt.id))

  return (
    <>
      <PageHeader
        title={prompt.promptText}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <EnginesEditor prompt={prompt} />
            {prompt.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </span>
        }
        trailing={
          <span className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setPasting(true)}>
              <ClipboardPaste aria-hidden size={15} /> Paste an answer
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={starting}>
              <Play aria-hidden size={15} /> {starting ? 'Starting…' : 'Run'}
            </button>
          </span>
        }
      />
      {runError && <div className="bg-danger-soft text-danger mb-4 rounded-md px-3 py-2.5 text-13">{runError}</div>}
      <RunBanner runIds={watching} brandId={prompt.brandId} />

      <Tabs
        value={tab}
        onChange={setTab}
        variant="underline"
        className="mb-5"
        options={[
          { k: 'responses', label: 'Responses', badge: results.data?.length || undefined },
          { k: 'sentiment', label: 'Sentiment' },
          { k: 'history', label: 'History', badge: promptRuns.length || undefined },
        ]}
      />

      {tab === 'responses' && (
        <ResponsesTab
          results={results.data ?? []}
          loading={results.isPending}
          names={names}
          pendingEngines={pendingEngines}
          onRetry={(engine) => void run([engine])}
        />
      )}
      {tab === 'sentiment' && <SentimentTab results={results.data ?? []} loading={results.isPending} brandId={prompt.brandId} judgeEnabled={profile.data?.judgeEnabled ?? true} />}
      {tab === 'history' && <HistoryTab runs={promptRuns} promptId={prompt.id} />}

      <PasteAnswerModal
        open={pasting}
        onClose={() => setPasting(false)}
        brandId={prompt.brandId}
        promptId={prompt.id}
        onSaved={(runId) => {
          setWatching([runId])
          void qc.invalidateQueries({ queryKey: ['results'] })
        }}
      />
    </>
  )
}

function ResponsesTab({
  results,
  loading,
  names,
  pendingEngines,
  onRetry,
}: {
  results: AnswerResult[]
  loading: boolean
  names: string[]
  /** Engines a watched run has not answered for yet — shown as skeletons. */
  pendingEngines: string[]
  onRetry: (engine: EngineId) => void
}) {
  // Latest per engine by default; a run picker shows earlier answers.
  const [runFilter, setRunFilter] = useState<string | 'latest'>('latest')
  const [diffing, setDiffing] = useState<string | null>(null)
  /** The previous ok answer from the same engine, for the diff. */
  const previousOf = (r: AnswerResult) =>
    results.find((o) => o.engine === r.engine && o.status === 'ok' && o.id !== r.id && o.fetchedAt < r.fetchedAt) ?? null
  const byRun = useMemo(() => {
    const m = new Map<string, AnswerResult[]>()
    for (const r of results) {
      const k = r.runId ?? 'none'
      m.set(k, [...(m.get(k) ?? []), r])
    }
    return m
  }, [results])
  const shown = useMemo(() => {
    if (runFilter !== 'latest') return byRun.get(runFilter) ?? []
    const seen = new Set<string>()
    return results.filter((r) => (seen.has(r.engine) ? false : (seen.add(r.engine), true)))
  }, [results, runFilter, byRun])

  if (loading) return <p className="text-text-soft text-sm">Loading…</p>
  if (results.length === 0 && pendingEngines.length === 0)
    return (
      <div className="empty-card">
        <h3>No answers yet</h3>
        <p className="text-text-soft text-sm">Run this prompt, or paste an answer you already have.</p>
      </div>
    )
  const runKeys = [...byRun.keys()]
  return (
    <>
      {runKeys.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <label htmlFor="rt-run" className="form-label">
            Showing
          </label>
          <select id="rt-run" className="form-select max-w-[320px]" value={runFilter} onChange={(e) => setRunFilter(e.target.value)}>
            <option value="latest">Latest answer per engine</option>
            {runKeys.map((k) => {
              const first = byRun.get(k)![0]
              return (
                <option key={k} value={k}>
                  Run on {new Date(first.fetchedAt).toLocaleString()} · {byRun.get(k)!.map((r) => engineLabel(r.engine)).join(', ')}
                </option>
              )
            })}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-4">
        {pendingEngines.map((e) => (
          <AnswerSkeleton key={`pending-${e}`} engine={e} />
        ))}
        {shown.filter((r) => runFilter !== 'latest' || !pendingEngines.includes(r.engine)).map((r) => {
          const prev = previousOf(r)
          return (
            <div key={r.id}>
              <AnswerCard
                result={r}
                names={names}
                trailing={
                  r.status !== 'ok' && isEngineId(r.engine) ? (
                    <button type="button" className="btn btn-secondary btn-sm min-w-0" onClick={() => onRetry(r.engine as EngineId)}>
                      Retry
                    </button>
                  ) : prev && r.status === 'ok' ? (
                    <button type="button" className="btn btn-ghost btn-sm min-w-0" onClick={() => setDiffing(diffing === r.id ? null : r.id)}>
                      {diffing === r.id ? 'Hide changes' : 'What changed'}
                    </button>
                  ) : undefined
                }
              />
              {prev && diffing === r.id && (
                <div className="bg-surface border-border-default mt-2 rounded-md border px-4 py-3">
                  <div className="text-text-soft mb-2 font-mono text-11 tracking-[0.09em] uppercase">
                    vs {new Date(prev.fetchedAt).toLocaleString()}
                  </div>
                  <AnswerDiff previous={prev.responseText ?? ''} current={r.responseText ?? ''} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function SentimentTab({ results, loading, brandId, judgeEnabled }: { results: AnswerResult[]; loading: boolean; brandId: string; judgeEnabled: boolean }) {
  const qc = useQueryClient()
  const okResults = useMemo(() => results.filter((r) => r.status === 'ok'), [results])
  const analyses = useQuery(analysesQueryOptions(okResults.map((r) => r.id)))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Latest answer per engine carries the headline; earlier ones follow.
  const seen = new Set<string>()
  const ordered = okResults.map((r) => ({ r, latest: seen.has(r.engine) ? false : (seen.add(r.engine), true) }))

  async function rejudge(id: string) {
    setError(null)
    setBusy(id)
    try {
      await reanalyze(brandId, [id])
      invalidateAfterRun(qc, brandId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not re-judge.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <p className="text-text-soft text-sm">Loading…</p>
  if (okResults.length === 0)
    return (
      <div className="empty-card">
        <h3>Nothing to judge yet</h3>
        <p className="text-text-soft text-sm">Run this prompt first; each answer is judged as it arrives.</p>
      </div>
    )
  const latestOnes = ordered.filter((o) => o.latest)
  return (
    <div className="flex flex-col gap-4">
      {error && <div className="bg-danger-soft text-danger rounded-md px-3 py-2.5 text-13">{error}</div>}
      {!judgeEnabled && (
        <div className="bg-info-soft text-info rounded-md px-3 py-2.5 text-13">
          Sentiment analysis is off for this brand. Answers are fetched and the facts below are extracted; turn the judge on in{' '}
          <Link to="/settings" className="underline">Settings</Link> to get stance, aspects, risks and competitor readings on new answers.
        </div>
      )}
      {latestOnes.length > 1 && (
        <div className="bg-surface border-border-default flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border px-4 py-3 text-13">
          <span className="text-text-soft font-mono text-11 tracking-[0.09em] uppercase">Latest by engine</span>
          {latestOnes.map(({ r }) => {
            const a = analyses.data?.get(r.id)
            return (
              <span key={r.id} className="flex items-center gap-2">
                <span className="text-text font-medium">{engineLabel(r.engine)}</span>
                {a ? <StancePill stance={stanceOf(a)} /> : <span className="text-text-soft">pending</span>}
              </span>
            )
          })}
        </div>
      )}
      {ordered.map(({ r }) => (
        <SentimentPanel
          key={r.id}
          result={r}
          analysis={analyses.data?.get(r.id) ?? null}
          onRejudge={judgeEnabled ? () => void rejudge(r.id) : undefined}
          rejudging={busy === r.id}
        />
      ))}
    </div>
  )
}

function HistoryTab({ runs, promptId }: { runs: Run[]; promptId: string }) {
  const { sort, toggle } = useSort('when', 'desc')
  const rows = sortRows(runs, sort, {
    when: (r) => r.createdAt,
    status: (r) => r.status,
    engines: (r) => r.engines.join(', '),
  })
  if (runs.length === 0)
    return (
      <div className="empty-card">
        <h3>No runs yet</h3>
      </div>
    )
  return (
    <div className="bg-surface border-border-default overflow-x-auto rounded-md border" style={{ contain: 'paint' }}>
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <SortTh label="When" k="when" sort={sort} onToggle={toggle} firstDir="desc" />
            <SortTh label="Status" k="status" sort={sort} onToggle={toggle} />
            <SortTh label="Engines" k="engines" sort={sort} onToggle={toggle} />
            <Th>Answers</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mine = r.units.filter((u) => u.prompt_id === promptId)
            return (
              <tr key={r.id} className="border-border-default border-b last:border-b-0">
                <td className="text-text px-4 py-3 font-mono text-xs">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      'rounded-full px-[9px] py-[3px] text-11 font-semibold ' +
                      (r.status === 'succeeded' ? 'bg-success-soft text-success' : r.status === 'running' ? 'bg-info-soft text-info' : 'bg-danger-soft text-danger')
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="text-text-muted px-4 py-3 text-13">{r.engines.map(engineLabel).join(', ')}</td>
                <td className="text-text-muted px-4 py-3 text-13">
                  {mine.length === 0
                    ? r.status === 'running'
                      ? 'in progress'
                      : '—'
                    : mine.map((u) => `${engineLabel(u.engine)}: ${u.status === 'no_answer' ? 'no answer shown' : u.status}`).join(' · ')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
