import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/badges'
import { safeHref } from '@/lib/utils'
import { engineLabel, highlightSegments, type AnswerResult } from '@/lib/tracker'

// One engine's answer: status, when, the text with the brand marked, the
// sources it cited. Text is rendered as paragraphs and simple list lines —
// no HTML from the engine ever reaches the DOM (the reference's
// dangerouslySetInnerHTML bug).

const STATUS_PILL: Record<AnswerResult['status'], string> = {
  ok: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger',
  unavailable: 'bg-warm-soft text-warm',
  no_answer: 'bg-surface-2 text-text-muted',
}

const STATUS_LABEL: Record<AnswerResult['status'], string> = {
  ok: 'ok',
  failed: 'failed',
  unavailable: 'unavailable',
  no_answer: 'no answer shown',
}

function Inline({ text, names }: { text: string; names: string[] }) {
  // The markdown the engines send that is worth keeping: **bold**, [text](url)
  // links, and [[n]](url) citation markers (rendered as a small number).
  const parts = text.split(/(\*\*[^*]+\*\*|\[\[\d+\]\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g)
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null
        const marker = /^\[\[(\d+)\]\]\(([^)]+)\)$/.exec(part)
        if (marker) {
          const href = safeHref(marker[2])
          const sup = <sup className="text-accent-deep ml-0.5 text-10">[{marker[1]}]</sup>
          return href ? (
            <a key={i} href={href} target="_blank" rel="noreferrer noopener" className="no-underline">
              {sup}
            </a>
          ) : (
            <span key={i}>{sup}</span>
          )
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
        if (link) {
          const href = safeHref(link[2])
          const inner = <Marked text={link[1]} names={names} />
          return href ? (
            <a key={i} href={href} target="_blank" rel="noreferrer noopener" className="text-accent-deep hover:underline">
              {inner}
            </a>
          ) : (
            <span key={i}>{inner}</span>
          )
        }
        const bold = part.startsWith('**') && part.endsWith('**')
        const inner = <Marked text={bold ? part.slice(2, -2) : part} names={names} />
        return bold ? <strong key={i}>{inner}</strong> : <span key={i}>{inner}</span>
      })}
    </>
  )
}

function Marked({ text, names }: { text: string; names: string[] }) {
  return (
    <>
      {highlightSegments(text, names).map((s, j) =>
        s.hit ? (
          <mark key={j} className="bg-agent-soft text-agent rounded-[3px] px-0.5">
            {s.text}
          </mark>
        ) : (
          <span key={j}>{s.text}</span>
        ),
      )}
    </>
  )
}

export function AnswerText({ text, names, className }: { text: string; names: string[]; className?: string }) {
  // Paragraphs split on blank lines; inside a block, heading lines (#…),
  // list lines (-, *, •, 1.) with nesting by indentation, and plain lines.
  // Some engines (Google's overview) put a blank line between table rows;
  // pull consecutive pipe rows back into one block before splitting.
  const joined = text.replace(/\r\n?/g, '\n').replace(/(\|[^\n]*\|)[ \t]*\n(?:[ \t]*\n)+(?=[ \t]*\|)/g, '$1\n')
  const blocks = joined.split(/\n\s*\n/)
  const LIST = /^(\s*)(?:[-*•]|\d+[.)])\s+(.*)$/
  const HEAD = /^#{1,6}\s+(.*)$/
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim())
        if (lines.length === 0) return null
        const out: React.ReactNode[] = []
        let items: Array<{ depth: number; text: string }> = []
        const flush = () => {
          if (items.length === 0) return
          out.push(
            <ul key={`l${out.length}`} className="my-2 flex list-disc flex-col gap-1 pl-5">
              {items.map((it, k) => (
                <li key={k} style={{ marginLeft: Math.min(it.depth, 3) * 16 }}>
                  <Inline text={it.text} names={names} />
                </li>
              ))}
            </ul>,
          )
          items = []
        }
        const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        for (let li = 0; li < lines.length; li++) {
          const l = lines[li]
          // A markdown table: a run of consecutive pipe lines, wherever it
          // sits in the block (Google's overview puts a heading line right
          // above it).
          if (l.trim().startsWith('|')) {
            let end = li
            while (end + 1 < lines.length && lines[end + 1].trim().startsWith('|')) end++
            if (end > li) {
              flush()
              const rows = lines.slice(li, end + 1)
              const header = cells(rows[0])
              const body = rows.slice(1).filter((r) => !/^\|?\s*:?-{2,}/.test(r.trim())).map(cells)
              out.push(
                <div key={`t${out.length}`} className="my-3 overflow-x-auto" style={{ contain: 'paint' }}>
                  <table className="w-full min-w-[420px] border-collapse text-13">
                    <thead>
                      <tr>
                        {header.map((h, k) => (
                          <th key={k} className="bg-surface-2 border-border-default text-text-soft border-b px-3 py-2 text-left text-11 font-semibold tracking-[0.4px] uppercase">
                            <Inline text={h} names={names} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {body.map((row, r) => (
                        <tr key={r} className="border-border-default border-b last:border-b-0 align-top">
                          {header.map((_, k) => (
                            <td key={k} className="text-text px-3 py-2">
                              <Inline text={row[k] ?? ''} names={names} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>,
              )
              li = end
              continue
            }
          }
          const h = HEAD.exec(l)
          if (h) {
            flush()
            out.push(
              <p key={`h${out.length}`} className="text-text mt-3 mb-1 font-semibold">
                <Inline text={h[1]} names={names} />
              </p>,
            )
            continue
          }
          const m = LIST.exec(l)
          if (m) {
            items.push({ depth: Math.floor(m[1].replace(/\t/g, '    ').length / 2), text: m[2] })
            continue
          }
          flush()
          out.push(
            <p key={`p${out.length}`} className="my-2">
              <Inline text={l} names={names} />
            </p>,
          )
        }
        flush()
        return <div key={i}>{out}</div>
      })}
    </div>
  )
}

export function AnswerCard({
  result,
  names,
  trailing,
}: {
  result: AnswerResult
  /** Brand name + aliases to mark in the text. */
  names: string[]
  trailing?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const text = result.responseText ?? ''
  const long = text.length > 900
  // The collapsed preview stops at the last line break before the limit, so
  // a table or list is never cut mid-row.
  const cutAt = (() => {
    const head = text.slice(0, 900)
    const nl = head.lastIndexOf('\n')
    let at = nl > 300 ? nl : head.replace(/\s+\S*$/, '').length
    // If the cut lands inside a table, finish the table: a half table is
    // worse than a slightly longer preview.
    const lineStart = text.lastIndexOf('\n', at - 1) + 1
    if (text.slice(lineStart, at).trimStart().startsWith('|') || text.slice(at + 1, at + 2) === '|') {
      let end = at
      for (;;) {
        const next = text.indexOf('\n', end + 1)
        const line = text.slice(end + 1, next === -1 ? undefined : next)
        if (!line.trimStart().startsWith('|')) break
        if (next === -1) return text.length
        end = next
      }
      at = end
    }
    return at
  })()
  const shown = long && !expanded ? text.slice(0, cutAt) + '\n…' : text
  return (
    <article className="bg-surface border-border-default rounded-md border">
      <header className="border-border-default flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <span className="text-text text-15 font-semibold">{engineLabel(result.engine)}</span>
        {result.engineModel && <span className="text-text-soft font-mono text-11">{result.engineModel}</span>}
        <span className={`${STATUS_PILL[result.status]} rounded-full px-[9px] py-[3px] text-11 font-semibold tracking-[0.2px]`}>
          {STATUS_LABEL[result.status]}
        </span>
        <span className="text-text-soft ml-auto font-mono text-11">
          {new Date(result.fetchedAt).toLocaleString()}
        </span>
        {trailing}
      </header>
      <div className="px-4 py-3">
        {result.status === 'no_answer' ? (
          <p className="text-text-muted text-sm">
            {engineLabel(result.engine)} showed nothing for this query in this market. That is itself a signal: no one is being
            recommended here yet.
          </p>
        ) : result.status !== 'ok' ? (
          <p className="text-text-muted text-sm">{result.error ?? 'No answer.'}</p>
        ) : (
          <>
            <AnswerText text={shown} names={names} className="text-text text-sm leading-[1.6]" />
            {long && (
              <button type="button" className="text-accent-deep text-13 hover:underline" onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show less' : 'Read the full answer'}
              </button>
            )}
          </>
        )}
        {result.citations.length > 0 && (
          <div className="border-border-default mt-3 border-t pt-3">
            <div className="text-text-soft mb-1.5 font-mono text-11 tracking-[0.09em] uppercase">Sources</div>
            <ol className="flex flex-col gap-1">
              {result.citations.map((c) => {
                const href = safeHref(c.url)
                return (
                  <li key={`${c.position}-${c.url}`} className="flex items-center gap-2 text-13">
                    <span className="text-text-soft w-5 shrink-0 font-mono text-11">{c.position || '·'}</span>
                    <Badge>{c.domain}</Badge>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent-deep inline-flex min-w-0 items-center gap-1 truncate hover:underline">
                        <span className="truncate">{c.title || c.url}</span>
                        <ExternalLink aria-hidden size={12} className="shrink-0" />
                      </a>
                    ) : (
                      <span className="text-text-muted truncate">{c.title || c.url}</span>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        )}
      </div>
    </article>
  )
}

/** A pending answer while its engine is still fetching. */
export function AnswerSkeleton({ engine }: { engine: string }) {
  return (
    <article aria-busy className="bg-surface border-border-default rounded-md border">
      <header className="border-border-default flex items-center gap-2 border-b px-4 py-3">
        <span className="text-text text-15 font-semibold">{engineLabel(engine)}</span>
        <span className="bg-info-soft text-info inline-flex items-center gap-1.5 rounded-full px-[9px] py-[3px] text-11 font-semibold">
          <span aria-hidden className="bg-info inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
          fetching
        </span>
      </header>
      <div className="flex animate-pulse flex-col gap-2.5 px-4 py-4">
        <span className="bg-surface-2 block h-3 w-11/12 rounded-[3px]" />
        <span className="bg-surface-2 block h-3 w-full rounded-[3px]" />
        <span className="bg-surface-2 block h-3 w-4/5 rounded-[3px]" />
        <span className="bg-surface-2 mt-2 block h-3 w-2/3 rounded-[3px]" />
        <span className="bg-surface-2 block h-3 w-3/4 rounded-[3px]" />
      </div>
    </article>
  )
}
