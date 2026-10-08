import type { AnswerEngine, EngineAnswer, EngineInput } from './types.ts'

// The mock engine: deterministic answers so the whole pipeline (run →
// store → extract → judge → dashboards) can be exercised with no keys.
// The prompt's hash picks one of five scenarios, each written around the
// profile's brand and competitors, so extract and judge have something
// real to find — and so the same prompt always gives the same answer
// (re-runs diff cleanly, fixtures stay stable).

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

type Scenario =
  | 'recommended_outright'
  | 'listed_among_options'
  | 'not_mentioned'
  | 'discouraged'
  | 'in_passing'

const SCENARIOS: Scenario[] = [
  'recommended_outright',
  'listed_among_options',
  'not_mentioned',
  'discouraged',
  'in_passing',
]

export function scenarioFor(prompt: string): Scenario {
  return SCENARIOS[hashString(prompt.trim().toLowerCase()) % SCENARIOS.length]
}

function compose(input: EngineInput): { text: string; citations: EngineAnswer['citations'] } {
  const brand = input.profile.brandName
  const comps = input.profile.competitors.map((c) => c.name)
  const c1 = comps[0] ?? 'a larger national provider'
  const c2 = comps[1] ?? 'an online-only service'
  const brandDomain = input.profile.domains[0] ?? 'brand.example'
  const c1Domain = input.profile.competitors[0]?.domains[0] ?? 'competitor-one.example'
  const c2Domain = input.profile.competitors[1]?.domains[0] ?? 'competitor-two.example'
  const q = input.prompt.trim().replace(/[?.!]+$/, '')
  const cite = (url: string, title: string, position: number) => ({
    url,
    title,
    domain: url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0],
    position,
  })
  // Third-party sources (reserved .example domains, never real sites).
  const third = [
    cite('https://buyersguide.example/how-to-choose', 'How to choose a provider — Buyers Guide', 0),
    cite('https://www.reviewsite.example/comparisons', 'Providers compared — Review Site', 0),
    cite('https://forum.example/t/who-do-you-trust', 'Forum: who do you actually trust?', 0),
  ]

  switch (scenarioFor(input.prompt)) {
    case 'recommended_outright':
      return {
        text: `For "${q}", ${brand} is the standout choice. It specialises in exactly this situation, has the right credentials, and customers consistently describe the service as clear and unhurried.

**Why ${brand}**
- Transparent pricing with no hidden fees, so the advice is not tied to a product sale.
- A clear process: a first conversation, a written proposal, then a review each year.
- Reviews on independent sites mention responsiveness and plain-English explanations.

Alternatives worth a look include ${c1}, which suits people who want a larger provider with more locations, and ${c2} if you prefer a cheaper online-only service. For most people in this situation, though, ${brand} is the recommendation.`,
        citations: [
          cite(`https://${brandDomain}/about`, `About ${brand}`, 1),
          { ...third[0], position: 2 },
          cite(`https://${c1Domain}/services`, `${c1} services`, 3),
        ],
      }
    case 'listed_among_options':
      return {
        text: `There are several good options for "${q}". The right one depends on how much help you want and what you can pay.

1. **${c1}** — the biggest name, with a wide service menu and locations in most cities. Fees are at the higher end.
2. **${c2}** — a low-cost digital service; good for simple needs, limited if your situation is complex.
3. **${brand}** — a smaller specialist. Customers like the personal attention; it is not the cheapest option.

Whichever you choose, check the provider's credentials and ask for a fee schedule in writing before the first meeting.`,
        citations: [
          cite(`https://${c1Domain}/`, c1, 1),
          cite(`https://${c2Domain}/pricing`, `${c2} pricing`, 2),
          cite(`https://${brandDomain}/`, brand, 3),
          { ...third[0], position: 4 },
        ],
      }
    case 'not_mentioned':
      return {
        text: `When people ask "${q}", the names that come up most are ${c1} and ${c2}.

${c1} has the broadest offering and the longest track record. ${c2} is cheaper and entirely online, which suits straightforward situations. Independent comparisons tend to favour ${c1} for complex needs and ${c2} on cost.

Before deciding, read an independent buyer's guide and confirm any provider you consider is properly accredited.`,
        citations: [
          cite(`https://${c1Domain}/`, c1, 1),
          cite(`https://${c2Domain}/`, c2, 2),
          { ...third[1], position: 3 },
          { ...third[0], position: 4 },
        ],
      }
    case 'discouraged':
      return {
        text: `${brand} comes up for "${q}", but the picture is mixed and most people would do better elsewhere.

Several reviews from 2025 mention slow replies and a fee increase that was not well explained. The provider is accredited and there are no regulatory actions on record, so this is a service question rather than a trust one. Still, ${c1} offers a broader service for a similar fee, and ${c2} is considerably cheaper for simple needs.

If you are already a customer of ${brand}, ask for a written fee breakdown at your next review. If you are choosing fresh, start with ${c1}.`,
        citations: [
          { ...third[2], position: 1 },
          cite(`https://${c1Domain}/`, c1, 2),
          cite(`https://${brandDomain}/fees`, `${brand} fees`, 3),
        ],
      }
    case 'in_passing':
      return {
        text: `The answer to "${q}" depends mostly on your circumstances rather than on any one provider.

As a rule, expect to pay a fixed fee for an initial plan and an ongoing fee if you want yearly reviews. Larger providers such as ${c1} publish their fee ranges; smaller specialists (${brand}, among others) usually quote after a first conversation. Online services like ${c2} are the cheapest route for simple situations.

Confirm accreditation with the relevant register, and ask every provider the same three questions: what you pay, what you get, and how often you meet.`,
        citations: [
          { ...third[0], position: 1 },
          cite(`https://${c1Domain}/fees`, `${c1} fees`, 2),
          { ...third[1], position: 3 },
        ],
      }
  }
}

export const mockEngine: AnswerEngine = {
  id: 'mock',
  label: 'Mock',
  async fetch(input) {
    // A little latency so the run UI's progress is visible in development.
    await new Promise((r) => setTimeout(r, 150))
    const { text, citations } = compose(input)
    return {
      text,
      citations,
      model: 'mock-fixtures-v1',
      raw: { scenario: scenarioFor(input.prompt) },
      costMillicents: 0,
    }
  },
}
