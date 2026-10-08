import { useId, useState } from 'react'
import type { TrendPoint } from '@/lib/tracker'

// One measure over time (the dataviz rule: one axis per chart — visibility
// and stance live in two charts, never on a dual axis). Hand-rolled SVG
// in the app's register: 2px line on the chart-1 token, 8px markers,
// recessive grid, text in text tokens, a hover tooltip, and a table view
// so the numbers are never color-alone.

export function TrendChart({
  title,
  points,
  value,
  format,
  domain,
}: {
  title: string
  points: TrendPoint[]
  value: (p: TrendPoint) => number | null
  format: (v: number) => string
  /** Fixed y range so day-to-day charts compare. */
  domain: [number, number]
}) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const W = 560
  const H = 180
  const padL = 36
  const padR = 12
  const padT = 12
  const padB = 24
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const data = points.map((p) => ({ p, v: value(p) })).filter((d): d is { p: TrendPoint; v: number } => d.v !== null)
  const x = (i: number) => padL + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  const y = (v: number) => padT + innerH - ((v - domain[0]) / (domain[1] - domain[0])) * innerH
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.v).toFixed(1)}`).join(' ')
  const ticks = [domain[0], (domain[0] + domain[1]) / 2, domain[1]]
  const fmtDay = (day: string) => new Date(day + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (data.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    setHover(best)
  }

  return (
    <section className="bg-surface border-border-default rounded-md border p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-text text-15 font-semibold">{title}</h3>
        <button type="button" className="text-text-soft hover:text-text text-11 underline decoration-dotted" onClick={() => setTable((t) => !t)}>
          {table ? 'show chart' : 'show table'}
        </button>
      </div>
      {data.length === 0 ? (
        <p className="text-text-soft text-13">No data yet.</p>
      ) : table ? (
        <table className="w-full border-collapse text-13">
          <thead>
            <tr className="text-text-soft text-left text-11 uppercase tracking-[0.4px]">
              <th className="py-1 font-semibold">Day</th>
              <th className="py-1 font-semibold">Answers</th>
              <th className="py-1 font-semibold">{title}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.p.day} className="border-border-default border-t">
                <td className="text-text py-1 font-mono text-xs">{fmtDay(d.p.day)}</td>
                <td className="text-text-muted py-1 font-mono text-xs">{d.p.answers}</td>
                <td className="text-text py-1 font-mono text-xs">{format(d.v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full"
            role="img"
            aria-labelledby={`${id}-t`}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          >
            <title id={`${id}-t`}>
              {title}: {data.map((d) => `${fmtDay(d.p.day)} ${format(d.v)}`).join(', ')}
            </title>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="stroke-border-default" strokeWidth={1} />
                <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" className="fill-text-soft font-mono" fontSize={10}>
                  {format(t)}
                </text>
              </g>
            ))}
            <path d={path} fill="none" className="stroke-chart-1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => (
              <circle
                key={d.p.day}
                cx={x(i)}
                cy={y(d.v)}
                r={hover === i ? 5 : 4}
                className="fill-chart-1 stroke-surface"
                strokeWidth={2}
              />
            ))}
            {data.map((d, i) =>
              data.length <= 8 || i === 0 || i === data.length - 1 ? (
                <text key={`${d.p.day}-x`} x={x(i)} y={H - 6} textAnchor="middle" className="fill-text-soft font-mono" fontSize={10}>
                  {fmtDay(d.p.day)}
                </text>
              ) : null,
            )}
          </svg>
          {hover !== null && data[hover] && (
            <div
              className="bg-surface-elevated border-border-default text-text pointer-events-none absolute rounded-sm border px-2 py-1 text-11 shadow-card-md"
              style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(data[hover].v) / H) * 100}%`, transform: 'translate(-50%, -120%)' }}
            >
              <span className="text-text-soft font-mono">{fmtDay(data[hover].p.day)}</span> · {format(data[hover].v)} · {data[hover].p.answers} answer{data[hover].p.answers === 1 ? '' : 's'}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
