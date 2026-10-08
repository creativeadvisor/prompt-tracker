import { quoteInText, validateJudgment } from './validate.ts'

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg)
}

const text = `Northwind Coffee Roasters is the standout choice. It "specialises" in exactly this situation — customers describe the service as clear.

Alternatives include Bean & Barrel, which suits people who want a larger provider.`

Deno.test('quotes match verbatim modulo whitespace and quote marks', () => {
  assert(quoteInText('Northwind Coffee Roasters is the standout choice.', text), 'exact')
  assert(quoteInText('It “specialises” in exactly   this situation – customers', text), 'smart quotes, dash, spaces')
  assert(!quoteInText('Northwind Coffee Roasters is the best choice.', text), 'paraphrase rejected')
  assert(!quoteInText('is the', text), 'too short to count')
})

Deno.test('validate drops invented quotes and counts them', () => {
  const v = validateJudgment(
    {
      brand: { mentioned: true, stance: 'strongly_positive', recommendation: 'recommended_outright', confidence: 'high', framing_quote: 'the standout choice' },
      aspects: [
        { aspect: 'clarity', polarity: 'positive', quote: 'customers describe the service as clear' },
        { aspect: 'price', polarity: 'negative', quote: 'fees are high' },
      ],
      competitors: [
        { name: 'Bean & Barrel', known: true, stance: 'neutral', recommendation: 'listed_among_options', quote: 'which suits people who want a larger provider' },
        { name: 'Acme Roasting', known: false, stance: 'positive', recommendation: 'recommended_outright', quote: 'Acme is great' },
      ],
      risk_flags: [{ type: 'outdated', quote: 'not in the text at all', note: 'x' }],
      opportunities: [
        { text: 'Lean on the clarity story', basis: 'aspect', basis_index: 0 },
        { text: 'Answer the price objection', basis: 'aspect', basis_index: 1 },
      ],
      summary: 'Recommended outright.',
    },
    text,
    ['Bean & Barrel', 'Ridgeline'],
  )
  assert(v.judgment.aspects.length === 1, 'one aspect survives')
  assert(v.dropped.aspects === 1, 'one aspect dropped')
  assert(v.judgment.competitors.length === 1 && v.judgment.competitors[0].known, 'invented competitor dropped, known kept')
  assert(v.dropped.competitors === 1, 'competitor drop counted')
  assert(v.judgment.risk_flags.length === 0 && v.dropped.risk_flags === 1, 'risk with a bad quote dropped')
  assert(v.judgment.opportunities.length === 1 && v.judgment.opportunities[0].basis_index === 0, 'opportunity on a dropped finding is dropped; the other re-indexed')
  assert(v.judgment.brand.framing_quote === 'the standout choice', 'framing quote kept')
})

Deno.test('validate: not mentioned forces the enums', () => {
  const v = validateJudgment({ brand: { mentioned: false, stance: 'positive', recommendation: 'recommended_outright' } }, text, [])
  assert(v.judgment.brand.stance === 'not_mentioned' && v.judgment.brand.recommendation === 'not_mentioned', 'forced')
  const w = validateJudgment({ brand: { mentioned: true, stance: 'not_mentioned' } }, text, [])
  assert(w.judgment.brand.stance === 'neutral', 'mentioned cannot be not_mentioned')
})

Deno.test('validate survives garbage', () => {
  const v = validateJudgment(null, text, [])
  assert(v.judgment.brand.mentioned === false && v.judgment.summary === '', 'defaults')
})
