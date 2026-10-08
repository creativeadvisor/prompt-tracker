import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Panel } from '@/components/page-shell'
import { Badge } from '@/components/badges'
import { HoverTip } from '@/components/hover-tip'
import {
  engineLabel,
  JUDGE_LABELS,
  RECOMMENDATION_LABELS,
  STANCE_LABELS,
  stanceOf,
  stanceTone,
  type Analysis,
  type AnswerResult,
} from '@/lib/tracker'

// The judge's reading of one answer:
// stance and recommendation toward the brand, the quote that shows it,
// aspects, competitors, risks, opportunities — every quote verbatim from
// the answer (validated server-side; the drop count is shown, not hidden).
// Provenance is explicit: a real judgment names its model, the mock is
// labelled as such, and an unjudged answer says so.

export function StancePill({ stance, className }: { stance: Analysis['stance'] | null; className?: string }) {
  if (stance === null)
    return (
      <span className={`bg-surface-2 text-text-soft inline-flex items-center rounded-full px-[9px] py-[3px] text-11 font-semibold tracking-[0.2px] whitespace-nowrap ${className ?? ''}`}>
        Not judged
      </span>
    )
  return (
    <span className={`${stanceTone(stance)} inline-flex items-center rounded-full px-[9px] py-[3px] text-11 font-semibold tracking-[0.2px] whitespace-nowrap ${className ?? ''}`}>
      {STANCE_LABELS[stance]}
    </span>
  )
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-border-strong text-text-muted my-1 border-l-2 pl-3 text-13 italic">“{children}”</blockquote>
  )
}

export function SentimentPanel({
  result,
  analysis,
  onRejudge,
  rejudging,
}: {
  result: AnswerResult
  analysis: Analysis | null
  onRejudge?: () => void
  rejudging?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const j = analysis?.judgment ?? null
  const droppedTotal = analysis ? Object.values(analysis.dropped).reduce((a, b) => a + b, 0) : 0

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>{engineLabel(result.engine)}</span>
          {analysis && <StancePill stance={stanceOf(analysis)} />}
        </span>
      }
      trailing={
        <span className="flex items-center gap-3">
          <span className="text-text-soft font-mono text-11">{new Date(result.fetchedAt).toLocaleString()}</span>
          {onRejudge && (
            <button type="button" className="btn btn-ghost btn-sm min-w-0" onClick={onRejudge} disabled={rejudging}>
              <RefreshCw aria-hidden size={13} className={rejudging ? 'animate-spin' : ''} /> {rejudging ? 'Judging…' : 'Re-judge'}
            </button>
          )}
        </span>
      }
    >
      {!analysis ? (
        <p className="text-text-soft text-sm">Not analysed yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {/* The facts */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-13 sm:grid-cols-4">
            <div>
              <dt className="text-text-soft font-mono text-11 tracking-[0.09em] uppercase">Mentioned</dt>
              <dd className="text-text font-medium">{analysis.brandMentioned ? `Yes · ${analysis.mentionCount}×` : 'No'}</dd>
            </div>
            <div>
              <dt className="text-text-soft font-mono text-11 tracking-[0.09em] uppercase">Position</dt>
              <dd className="text-text font-medium">
                {analysis.mentionRank ? `#${analysis.mentionRank} of ${analysis.namedCount} named` : '—'}
                {analysis.mentionParagraph !== null && analysis.mentionParagraph !== undefined && (
                  <span className="text-text-soft"> · para {analysis.mentionParagraph + 1}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-text-soft font-mono text-11 tracking-[0.09em] uppercase">Recommendation</dt>
              <dd className="text-text font-medium">{analysis.judge === 'none' ? '—' : RECOMMENDATION_LABELS[analysis.recommendation]}</dd>
            </div>
            <div>
              <dt className="text-text-soft font-mono text-11 tracking-[0.09em] uppercase">Confidence</dt>
              <dd className="text-text font-medium capitalize">{analysis.confidence ?? '—'}</dd>
            </div>
          </dl>

          {analysis.summary && <p className="text-text text-sm">{analysis.summary}</p>}
          {j?.brand.framing_quote && <Quote>{j.brand.framing_quote}</Quote>}

          {analysis.judge === 'none' && (
            <p className="text-text-soft text-13">
              {analysis.brandMentioned || analysis.namedCount > 0
                ? 'Sentiment analysis did not run for this answer. Turn it on in Settings to judge new answers, or use Re-judge for this one.'
                : 'Neither the brand nor a known competitor is named, so there is nothing to judge.'}
            </p>
          )}

          {j && (j.aspects.length > 0 || j.risk_flags.length > 0) && (
            <div className="grid gap-5 md:grid-cols-2">
              {j.aspects.length > 0 && (
                <section>
                  <h3 className="text-text-soft mb-2 font-mono text-11 tracking-[0.09em] uppercase">What it says about the brand</h3>
                  <ul className="flex flex-col gap-2">
                    {j.aspects.map((a, i) => (
                      <li key={i}>
                        <span className="flex items-center gap-2">
                          <span className={`${a.polarity === 'positive' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'} rounded-full px-[9px] py-[3px] text-11 font-semibold`}>
                            {a.polarity}
                          </span>
                          <span className="text-text text-13 font-medium capitalize">{a.aspect}</span>
                        </span>
                        <Quote>{a.quote}</Quote>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {j.risk_flags.length > 0 && (
                <section>
                  <h3 className="text-text-soft mb-2 font-mono text-11 tracking-[0.09em] uppercase">Risks</h3>
                  <ul className="flex flex-col gap-2">
                    {j.risk_flags.map((r, i) => (
                      <li key={i}>
                        <span className="flex items-center gap-2">
                          <Badge variant="urgent">{r.type.replace(/_/g, ' ')}</Badge>
                          <span className="text-text-muted text-13">{r.note}</span>
                        </span>
                        <Quote>{r.quote}</Quote>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {j && j.competitors.length > 0 && (
            <section>
              <h3 className="text-text-soft mb-2 font-mono text-11 tracking-[0.09em] uppercase">Competitors in this answer</h3>
              <div className="overflow-x-auto" style={{ contain: 'paint' }}>
                <table className="w-full min-w-[520px] border-collapse text-13">
                  <thead>
                    <tr className="text-text-soft text-left text-11 uppercase tracking-[0.4px]">
                      <th className="py-1.5 pr-3 font-semibold">Name</th>
                      <th className="py-1.5 pr-3 font-semibold">Stance</th>
                      <th className="py-1.5 pr-3 font-semibold">Recommendation</th>
                      <th className="py-1.5 font-semibold">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {j.competitors.map((c, i) => (
                      <tr key={i} className="border-border-default border-t align-top">
                        <td className="py-2 pr-3">
                          <span className="text-text font-medium">{c.name}</span>
                          {!c.known && <span className="text-text-soft ml-1.5 text-11">new</span>}
                        </td>
                        <td className="py-2 pr-3">
                          <StancePill stance={c.stance} />
                        </td>
                        <td className="text-text-muted py-2 pr-3">{RECOMMENDATION_LABELS[c.recommendation]}</td>
                        <td className="text-text-muted py-2 italic">{c.quote ? `“${c.quote}”` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {j && j.opportunities.length > 0 && (
            <section>
              <h3 className="text-text-soft mb-2 font-mono text-11 tracking-[0.09em] uppercase">Opportunities</h3>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
                {j.opportunities.map((o, i) => (
                  <li key={i} className="text-text">
                    {o.text}
                    <span className="text-text-soft ml-1.5 text-11">
                      (from {o.basis === 'aspect' ? j.aspects[o.basis_index]?.aspect : o.basis === 'competitor' ? j.competitors[o.basis_index]?.name : j.risk_flags[o.basis_index]?.type.replace(/_/g, ' ')})
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="text-text-soft flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-11">
            <span>{analysis.judge === 'model' ? `judged by ${analysis.model ?? 'model'}` : JUDGE_LABELS[analysis.judge].toLowerCase()}</span>
            {droppedTotal > 0 && (
              <HoverTip text="Findings whose quote was not found verbatim in the answer are dropped rather than shown.">
                <span className="cursor-help underline decoration-dotted">{droppedTotal} unverifiable finding{droppedTotal === 1 ? '' : 's'} dropped</span>
              </HoverTip>
            )}
            <button type="button" className="hover:text-text underline decoration-dotted" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'hide citations' : `citations: ${analysis.citationOwners.brand} brand · ${analysis.citationOwners.competitor} competitor · ${analysis.citationOwners.third_party} other`}
            </button>
          </div>
          {showAll && result.citations.length > 0 && (
            <ul className="text-13">
              {result.citations.map((c) => (
                <li key={`${c.position}-${c.url}`} className="text-text-muted truncate">
                  {c.position}. {c.domain} — {c.title ?? c.url}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  )
}
