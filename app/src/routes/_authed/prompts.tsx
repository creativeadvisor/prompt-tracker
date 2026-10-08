import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Play, Plus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { TrackerPage } from '@/components/tracker/tracker-page'
import { AddPromptsModal } from '@/components/tracker/add-prompts-modal'
import { useRunProgress } from '@/lib/tracker-runs'
import { StancePill } from '@/components/tracker/sentiment-panel'
import { ScheduleControl } from '@/components/tracker/schedule-control'
import { SetEnginesModal } from '@/components/tracker/set-engines-modal'
import { downloadCsv } from '@/lib/export'
import { ConfirmDialog } from '@/components/modal'
import { FilterBar, FilterChip } from '@/components/filter-chip'
import { SortTh, Th } from '@/components/table'
import { RowCard, RowCardList } from '@/components/row-cards'
import { Badge } from '@/components/badges'
import { sortRows, useSort } from '@/lib/table-sort'
import { rowLinkProps } from '@/lib/utils'
import {
  analysesQueryOptions,
  brandResultsQueryOptions,
  deletePrompt,
  engineLabel,
  latestByPromptEngine,
  profileQueryOptions,
  promptsCsv,
  promptsQueryOptions,
  startRuns,
  tagCounts,
  type TrackedPrompt,
  type BrandProfile,
} from '@/lib/tracker'

// Prompts — the tracked questions for the brand in scope: a sortable
// table, tag chips, add one or a list, run, delete, export.

export const Route = createFileRoute('/_authed/prompts')({
  component: PromptsPage,
})

function PromptsPage() {
  return (
    <TrackerPage
      title="Prompts"
      subtitle="The questions you're tracking, and how engines answer them."
    >
      {(brand) => <PromptsBody brand={brand} />}
    </TrackerPage>
  )
}

function PromptsBody({ brand }: { brand: BrandProfile }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const prompts = useQuery(promptsQueryOptions(brand.id))
  const profile = useQuery(profileQueryOptions(brand.id))
  const results = useQuery(brandResultsQueryOptions(brand.id))
  const latest = useMemo(() => latestByPromptEngine(results.data ?? []), [results.data])
  const latestIds = useMemo(() => [...latest.values()].filter((r) => r.status === 'ok').map((r) => r.id), [latest])
  const analyses = useQuery(analysesQueryOptions(latestIds))
  /** The headline for a prompt: its latest answers' analyses. */
  const headline = (p: TrackedPrompt) => {
    const as = p.engines
      .map((e) => latest.get(`${p.id}:${e}`))
      .filter((r): r is NonNullable<typeof r> => !!r && r.status === 'ok')
      .map((r) => analyses.data?.get(r.id))
      .filter((a): a is NonNullable<typeof a> => !!a)
    if (as.length === 0) return null
    const mentioned = as.filter((a) => a.brandMentioned).length
    // Stance only from judged answers; none judged → no stance to show.
    const judged = as.filter((a) => a.judge !== 'none')
    if (judged.length === 0) return { mentioned, total: as.length, score: null, stance: null }
    const score = judged.reduce((s, a) => s + a.stanceScore, 0) / judged.length
    const worst = judged.reduce((w, a) => (a.stanceScore < w.stanceScore ? a : w), judged[0])
    const best = judged.reduce((b, a) => (a.stanceScore > b.stanceScore ? a : b), judged[0])
    return { mentioned, total: as.length, score, stance: mentioned === 0 ? ('not_mentioned' as const) : score >= 0 ? best.stance : worst.stance }
  }
  const lastRunOf = (p: TrackedPrompt): string | null => {
    let last: string | null = null
    for (const e of p.engines) {
      const r = latest.get(`${p.id}:${e}`)
      if (r && (!last || r.fetchedAt > last)) last = r.fetchedAt
    }
    return last
  }
  const [adding, setAdding] = useState(false)
  const [settingEngines, setSettingEngines] = useState(false)
  const [watching, setWatching] = useState<string[]>([])
  const [starting, setStarting] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  // Progress lives in the rows, not in a banner: each prompt in the
  // watched runs shows its own count while in flight, then fills in.
  const progress = useRunProgress(watching, brand.id)
  const rowProgress = (p: TrackedPrompt) => {
    const units = progress.units.filter((u) => u.promptId === p.id)
    if (units.length === 0) return null
    const done = units.filter((u) => u.outcome).length
    const failed = units.filter((u) => u.outcome && (u.outcome.status === 'failed' || u.outcome.status === 'unavailable')).length
    return { total: units.length, done, failed, running: progress.running && done < units.length }
  }
  const [tag, setTag] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [toDelete, setToDelete] = useState<TrackedPrompt | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const { sort, toggle } = useSort('created', 'desc')

  const rows = prompts.data ?? []
  const tags = useMemo(() => tagCounts(rows), [rows])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = rows.filter(
      (p) => (!tag || p.tags.includes(tag)) && (!q || p.promptText.toLowerCase().includes(q)),
    )
    return sortRows(filtered, sort, {
      prompt: (p) => p.promptText,
      tags: (p) => p.tags.join(', ') || null,
      engines: (p) => p.engines.length,
      created: (p) => p.createdAt,
      lastRun: (p) => lastRunOf(p),
      mentioned: (p) => {
        const h = headline(p)
        return h ? h.mentioned / h.total : null
      },
      stance: (p) => headline(p)?.score ?? null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tag, search, sort, latest, analyses.data])

  if (prompts.isPending) return <p className="text-text-soft text-sm">Loading…</p>
  if (prompts.isError) return <p className="text-danger text-sm">Could not load prompts: {prompts.error.message}</p>

  const openPrompt = (p: TrackedPrompt) =>
    navigate({ to: '/prompts/$promptId', params: { promptId: p.id } })

  async function run(targets: TrackedPrompt[]) {
    setRunError(null)
    setNotice(null)
    const active = targets.filter((p) => p.status === 'active')
    if (active.length === 0) return
    setStarting(true)
    try {
      const { runIds } = await startRuns(active, brand.id)
      setWatching(runIds)
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Could not start the run.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <>
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          aria-label="Search prompts"
          className="form-input max-w-[320px]"
          placeholder="Search prompts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="flex flex-wrap items-center gap-2">
          <ScheduleControl brandId={brand.id} />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={visible.length === 0}
            onClick={() => setSettingEngines(true)}
          >
            <SlidersHorizontal aria-hidden size={15} /> Engines…
          </button>
          <button
            type="button"
            aria-label="Export as CSV"
            className="btn btn-secondary min-w-0 px-2.5"
            disabled={visible.length === 0}
            onClick={() => {
              const { header, rows: csvRows } = promptsCsv(visible, latest, analyses.data)
              downloadCsv(`prompt-tracker-${brand.brandName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`, header, csvRows)
            }}
          >
            <Download aria-hidden size={15} />
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void run(visible)}
            disabled={starting || progress.running || visible.length === 0}
          >
            <Play aria-hidden size={15} /> {starting ? 'Starting…' : progress.running ? `Running ${progress.done}/${progress.total || '…'}` : `Run ${tag ? tag : 'all'} (${visible.length})`}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus aria-hidden size={15} /> Add prompts
          </button>
        </span>
      </div>
      {runError && <div className="bg-danger-soft text-danger mb-4 rounded-md px-3 py-2.5 text-13">{runError}</div>}

      {tags.length > 0 && (
        <FilterBar>
          <FilterChip active={tag === null} count={rows.length} onClick={() => setTag(null)}>
            All
          </FilterChip>
          {tags.map((t) => (
            <FilterChip key={t.tag} active={tag === t.tag} count={t.count} onClick={() => setTag(tag === t.tag ? null : t.tag)}>
              {t.tag}
            </FilterChip>
          ))}
        </FilterBar>
      )}

      {notice && (
        <div className="bg-info-soft text-info mb-4 rounded-md px-3 py-2.5 text-13">{notice}</div>
      )}

      {rows.length === 0 ? (
        <div className="empty-card">
          <h3>No prompts yet</h3>
          <p className="text-text-soft text-sm">
            Add the questions this brand should show up in, then run them on the engines you track.
          </p>
          <div className="mt-4 flex justify-center">
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              Add prompts
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* md+: the table */}
          <div className="bg-surface border-border-default hidden overflow-x-auto rounded-md border md:block" style={{ contain: 'paint' }}>
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr>
                  <SortTh label="Prompt" k="prompt" sort={sort} onToggle={toggle} />
                  <SortTh label="Tags" k="tags" sort={sort} onToggle={toggle} />
                  <SortTh label="Engines" k="engines" sort={sort} onToggle={toggle} firstDir="desc" />
                  <SortTh label="Mentioned" k="mentioned" sort={sort} onToggle={toggle} firstDir="desc" />
                  <SortTh label="Stance" k="stance" sort={sort} onToggle={toggle} firstDir="desc" />
                  <SortTh label="Last run" k="lastRun" sort={sort} onToggle={toggle} firstDir="desc" />
                  <SortTh label="Added" k="created" sort={sort} onToggle={toggle} firstDir="desc" />
                  <Th className="w-20">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    {...rowLinkProps(() => void openPrompt(p))}
                    className="border-border-default hover:bg-surface-2 cursor-pointer border-b last:border-b-0"
                  >
                    <td className="text-text px-4 py-3 font-medium">{p.promptText}</td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1">
                        {p.tags.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </span>
                    </td>
                    <td className="text-text-muted px-4 py-3 text-13">{p.engines.map(engineLabel).join(', ')}</td>
                    {(() => {
                      const h = headline(p)
                      const rp = rowProgress(p)
                      if (rp?.running)
                        return (
                          <>
                            <td className="px-4 py-3">
                              <span aria-hidden className="bg-surface-2 block h-3 w-10 animate-pulse rounded-[3px]" />
                            </td>
                            <td className="px-4 py-3">
                              <span aria-hidden className="bg-surface-2 block h-5 w-20 animate-pulse rounded-full" />
                            </td>
                            <td className="text-info px-4 py-3 font-mono text-xs">
                              <span className="inline-flex items-center gap-1.5">
                                <span aria-hidden className="bg-info inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
                                {rp.done}/{rp.total}
                              </span>
                              <span className="sr-only">running</span>
                            </td>
                          </>
                        )
                      return (
                        <>
                          <td className="px-4 py-3 font-mono text-xs">
                            {h ? (
                              <span className={h.mentioned === 0 ? 'text-text-soft' : 'text-text'}>
                                {h.mentioned}/{h.total}
                              </span>
                            ) : (
                              <span className="text-text-soft">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">{h ? <StancePill stance={h.stance} /> : <span className="text-text-soft text-xs">—</span>}</td>
                          <td className="px-4 py-3 font-mono text-xs">
                            <span className="text-text-muted">{lastRunOf(p) ? new Date(lastRunOf(p)!).toLocaleDateString() : '—'}</span>
                            {rp && rp.failed > 0 && <span className="text-danger ml-2">{rp.failed} failed</span>}
                          </td>
                        </>
                      )
                    })()}
                    <td className="text-text-muted px-4 py-3 font-mono text-xs">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        aria-label={`Run prompt: ${p.promptText}`}
                        className="btn btn-ghost min-w-0 px-2"
                        disabled={starting || !!rowProgress(p)?.running}
                        onClick={(e) => {
                          e.stopPropagation()
                          void run([p])
                        }}
                      >
                        <Play aria-hidden size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete prompt: ${p.promptText}`}
                        className="btn btn-ghost min-w-0 px-2"
                        onClick={(e) => {
                          e.stopPropagation()
                          setToDelete(p)
                        }}
                      >
                        <Trash2 aria-hidden size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && (
              <p className="text-text-soft px-4 py-6 text-center text-sm">Nothing matches.</p>
            )}
          </div>
          {/* phones: cards */}
          <div className="md:hidden">
            <RowCardList>
              {visible.map((p) => (
                <RowCard
                  key={p.id}
                  title={p.promptText}
                  sub={p.engines.map(engineLabel).join(', ')}
                  pill={headline(p) ? <StancePill stance={headline(p)!.stance} /> : undefined}
                  meta={rowProgress(p)?.running ? `Running ${rowProgress(p)!.done}/${rowProgress(p)!.total}` : p.tags.join(', ') || undefined}
                  onOpen={() => void openPrompt(p)}
                />
              ))}
            </RowCardList>
          </div>
        </>
      )}

      <AddPromptsModal
        open={adding}
        onClose={() => setAdding(false)}
        qc={qc}
        brandId={brand.id}
        profile={profile.data ?? null}
        onCreated={(n, skipped) =>
          setNotice(
            `Added ${n} prompt${n === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}.`,
          )
        }
      />
      {settingEngines && (
        <SetEnginesModal
          open
          onClose={() => setSettingEngines(false)}
          prompts={visible}
          initial={profile.data?.defaultEngines ?? visible[0]?.engines ?? []}
          onDone={(n) => setNotice(`Updated engines on ${n} prompt${n === 1 ? '' : 's'}.`)}
        />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title="Delete this prompt?"
        message="Its runs and analyses go with it. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (toDelete) await deletePrompt(qc, toDelete)
          setToDelete(null)
        }}
        onClose={() => setToDelete(null)}
      />
    </>
  )
}
