import {
  CONFIDENCES,
  RECOMMENDATIONS,
  RISK_TYPES,
  STANCES,
  type Judgment,
  type Recommendation,
  type Stance,
} from './schema.ts'

// The hallucination guard: a finding
// stands only if its quote is really in the answer. Quotes are matched
// after normalising whitespace and quote marks, so a model that tidies a
// double space is not punished, while one that paraphrases is. Dropped
// findings are counted, not hidden.

export interface Validated {
  judgment: Judgment
  dropped: { aspects: number; competitors: number; risk_flags: number; opportunities: number; framing_quote: number }
}

export function normalizeForMatch(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Is `quote` a verbatim passage of `text` (modulo whitespace and quote marks)? */
export function quoteInText(quote: string | null | undefined, text: string): boolean {
  if (!quote) return false
  const q = normalizeForMatch(quote)
  if (q.length < 8) return false
  return normalizeForMatch(text).includes(q)
}

const asEnum = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Coerce whatever the model returned into a Judgment, dropping every
 *  item whose quote is not in the text. Tolerant of missing fields (the
 *  judge-mock and older rubric rows never throw here). */
export function validateJudgment(raw: unknown, text: string, knownCompetitors: string[]): Validated {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const b = (o.brand && typeof o.brand === 'object' ? o.brand : {}) as Record<string, unknown>
  const dropped = { aspects: 0, competitors: 0, risk_flags: 0, opportunities: 0, framing_quote: 0 }

  const mentioned = b.mentioned === true
  let stance = asEnum<Stance>(b.stance, STANCES, 'not_mentioned')
  let recommendation = asEnum<Recommendation>(b.recommendation, RECOMMENDATIONS, 'not_mentioned')
  if (!mentioned) {
    stance = 'not_mentioned'
    recommendation = 'not_mentioned'
  } else {
    if (stance === 'not_mentioned') stance = 'neutral'
    if (recommendation === 'not_mentioned') recommendation = 'mentioned_in_passing'
  }
  let framing_quote: string | null = str(b.framing_quote, 400) || null
  if (framing_quote && !quoteInText(framing_quote, text)) {
    framing_quote = null
    dropped.framing_quote = 1
  }

  const aspectsIn = Array.isArray(o.aspects) ? o.aspects : []
  const aspects: Judgment['aspects'] = []
  const aspectIndex = new Map<number, number>()
  aspectsIn.forEach((a, i) => {
    const x = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
    const quote = str(x.quote, 400)
    const aspect = str(x.aspect, 60)
    if (!aspect || !quoteInText(quote, text) || aspects.length >= 5) {
      dropped.aspects++
      return
    }
    aspectIndex.set(i, aspects.length)
    aspects.push({ aspect, polarity: x.polarity === 'negative' ? 'negative' : 'positive', quote })
  })

  const known = new Set(knownCompetitors.map((n) => n.toLowerCase()))
  const compsIn = Array.isArray(o.competitors) ? o.competitors : []
  const competitors: Judgment['competitors'] = []
  const compIndex = new Map<number, number>()
  compsIn.forEach((c, i) => {
    const x = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>
    const name = str(x.name, 80)
    if (!name) {
      dropped.competitors++
      return
    }
    let quote: string | null = str(x.quote, 400) || null
    if (quote && !quoteInText(quote, text)) quote = null
    const cStance = asEnum<Stance>(x.stance, STANCES, 'neutral')
    // A competitor with no verifiable quote and no mention in the text is
    // an invention: drop it.
    if (!quote && !normalizeForMatch(text).includes(name.toLowerCase())) {
      dropped.competitors++
      return
    }
    compIndex.set(i, competitors.length)
    competitors.push({
      name,
      known: known.has(name.toLowerCase()) ? true : x.known === true && known.has(name.toLowerCase()),
      stance: cStance === 'not_mentioned' ? 'neutral' : cStance,
      recommendation: asEnum<Recommendation>(x.recommendation, RECOMMENDATIONS, 'mentioned_in_passing'),
      quote,
    })
  })

  const risksIn = Array.isArray(o.risk_flags) ? o.risk_flags : []
  const risk_flags: Judgment['risk_flags'] = []
  const riskIndex = new Map<number, number>()
  risksIn.forEach((r, i) => {
    const x = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const quote = str(x.quote, 400)
    if (!quoteInText(quote, text)) {
      dropped.risk_flags++
      return
    }
    riskIndex.set(i, risk_flags.length)
    risk_flags.push({ type: asEnum(x.type, RISK_TYPES, 'factual_concern'), quote, note: str(x.note, 300) })
  })

  const oppsIn = Array.isArray(o.opportunities) ? o.opportunities : []
  const opportunities: Judgment['opportunities'] = []
  for (const op of oppsIn) {
    const x = (op && typeof op === 'object' ? op : {}) as Record<string, unknown>
    const text_ = str(x.text, 300)
    const basis = x.basis === 'competitor' ? 'competitor' : x.basis === 'risk_flag' ? 'risk_flag' : 'aspect'
    const idxMap = basis === 'competitor' ? compIndex : basis === 'risk_flag' ? riskIndex : aspectIndex
    const mapped = typeof x.basis_index === 'number' ? idxMap.get(x.basis_index) : undefined
    // An opportunity must point at a finding that survived.
    if (!text_ || mapped === undefined || opportunities.length >= 3) {
      dropped.opportunities++
      continue
    }
    opportunities.push({ text: text_, basis, basis_index: mapped })
  }

  return {
    judgment: {
      brand: { mentioned, stance, recommendation, confidence: asEnum(b.confidence, CONFIDENCES, 'low'), framing_quote },
      aspects,
      competitors,
      risk_flags,
      opportunities,
      summary: str(o.summary, 280),
    },
    dropped,
  }
}
