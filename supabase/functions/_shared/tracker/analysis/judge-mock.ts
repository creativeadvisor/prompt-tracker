import type { BrandProfile } from '../engines/types.ts'
import type { Extract } from './extract.ts'
import type { Judgment, Recommendation, Stance } from './schema.ts'

// A judgment without a model (no key → the mock judge). It reads the extract layer and
// the answer's own wording for a few unmistakable cues, so development
// data looks like judged data — and it is labelled `judge: 'mock'` in the
// row and the UI so nobody mistakes it for a reading.

function firstSentenceWith(text: string, names: string[]): string | null {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean)
  const forms = names.map((n) => n.toLowerCase()).filter((n) => n.length >= 2)
  const hit = sentences.find((s) => forms.some((f) => s.toLowerCase().includes(f)))
  return hit ? hit.slice(0, 200) : null
}

export function mockJudgment(text: string, x: Extract, profile: BrandProfile): Judgment {
  const names = [profile.brandName, ...profile.aliases]
  const lower = text.toLowerCase()
  const mentioned = x.brand.count > 0
  let stance: Stance = 'not_mentioned'
  let recommendation: Recommendation = 'not_mentioned'
  if (mentioned) {
    const brandRe = profile.brandName.toLowerCase()
    const near = (re: RegExp) => {
      const i = lower.indexOf(brandRe)
      const window = lower.slice(Math.max(0, i - 160), i + brandRe.length + 220)
      return re.test(window)
    }
    if (/\b(standout choice|is the recommendation|clear choice|best option)\b/.test(lower) && near(/standout|recommendation|clear choice|best option/)) {
      stance = 'strongly_positive'
      recommendation = 'recommended_outright'
    } else if (/\b(do better elsewhere|look elsewhere|avoid|start with (?!\b)(?:[a-z& ]+))\b/.test(lower) && /mixed|slow replies|not well explained|complaint/.test(lower)) {
      stance = 'negative'
      recommendation = 'discouraged'
    } else if (/stronger choice|is the stronger|is better for/.test(lower) && near(/stronger|better/)) {
      stance = 'positive'
      recommendation = 'recommended_conditionally'
    } else if (x.structure === 'list' || x.structure === 'comparison') {
      stance = 'neutral'
      recommendation = 'listed_among_options'
    } else {
      stance = 'neutral'
      recommendation = 'mentioned_in_passing'
    }
  }
  const framing = mentioned ? firstSentenceWith(text, names) : null
  const competitors = x.competitors
    .filter((c) => c.count > 0)
    .map((c) => ({
      name: c.name,
      known: true,
      stance: 'neutral' as Stance,
      recommendation: (stance === 'negative' ? 'recommended_conditionally' : 'listed_among_options') as Recommendation,
      quote: firstSentenceWith(text, [c.name]),
    }))
  const aspects: Judgment['aspects'] = []
  const risk_flags: Judgment['risk_flags'] = []
  if (stance === 'negative') {
    const q = firstSentenceWith(text, ['slow replies', 'fee increase'])
    if (q) aspects.push({ aspect: 'service', polarity: 'negative', quote: q })
    const r = firstSentenceWith(text, ['reviews from 2025'])
    if (r) risk_flags.push({ type: 'outdated', quote: r, note: 'Cites 2025 reviews as current.' })
  }
  if (stance === 'strongly_positive') {
    const q = firstSentenceWith(text, ['fee-for-service', 'no product commissions'])
    if (q) aspects.push({ aspect: 'pricing', polarity: 'positive', quote: q })
    const q2 = firstSentenceWith(text, ['responsiveness', 'plain-english'])
    if (q2) aspects.push({ aspect: 'service', polarity: 'positive', quote: q2 })
  }
  const opportunities: Judgment['opportunities'] = []
  if (aspects.length && aspects[0].polarity === 'negative')
    opportunities.push({ text: 'Publish current response-time and fee-change communications to counter the service criticism.', basis: 'aspect', basis_index: 0 })
  if (competitors.length && stance === 'not_mentioned')
    opportunities.push({ text: `Earn coverage where ${competitors[0].name} is cited so the brand enters the comparison set.`, basis: 'competitor', basis_index: 0 })
  const summary = !mentioned
    ? `${profile.brandName} is not mentioned; ${competitors.map((c) => c.name).join(' and ') || 'other providers'} fill the answer.`
    : stance === 'strongly_positive'
      ? `${profile.brandName} is the answer's clear recommendation.`
      : stance === 'negative'
        ? `${profile.brandName} is discussed critically and the reader is steered to ${competitors[0]?.name ?? 'alternatives'}.`
        : `${profile.brandName} appears as one option among ${Math.max(0, x.namedCount - 1)} others.`
  return {
    brand: { mentioned, stance, recommendation, confidence: mentioned ? 'medium' : 'high', framing_quote: framing },
    aspects,
    competitors,
    risk_flags,
    opportunities,
    summary,
  }
}
