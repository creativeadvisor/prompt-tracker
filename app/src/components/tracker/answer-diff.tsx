import { useMemo } from 'react'
import { diffWords } from 'diff'

// Run-to-run change in an engine's answer: word-level diff, additions on
// the success pair and removals on the danger pair (state pairs, both
// halves — never a bare brand hue). the app's register; the
// idea.

export function AnswerDiff({ previous, current }: { previous: string; current: string }) {
  const parts = useMemo(() => diffWords(previous, current), [previous, current])
  const added = parts.filter((p) => p.added).reduce((n, p) => n + p.value.split(/\s+/).filter(Boolean).length, 0)
  const removed = parts.filter((p) => p.removed).reduce((n, p) => n + p.value.split(/\s+/).filter(Boolean).length, 0)
  return (
    <div>
      <div className="text-text-soft mb-2 font-mono text-11">
        {added === 0 && removed === 0 ? 'No change from the previous answer.' : `+${added} / −${removed} words vs the previous answer`}
      </div>
      <p className="text-text text-sm leading-[1.7] whitespace-pre-wrap">
        {parts.map((p, i) =>
          p.added ? (
            <ins key={i} className="bg-success-soft text-success rounded-[2px] no-underline">
              {p.value}
            </ins>
          ) : p.removed ? (
            <del key={i} className="bg-danger-soft text-danger rounded-[2px]">
              {p.value}
            </del>
          ) : (
            <span key={i}>{p.value}</span>
          ),
        )}
      </p>
    </div>
  )
}
