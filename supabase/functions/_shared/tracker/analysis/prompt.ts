import type { BrandProfile } from '../engines/types.ts'
import { RUBRIC_VERSION } from './schema.ts'

// The judge's instructions. Two parts so the stable part caches: the
// rubric (identical for every call) goes first, the brand profile after
// it, and the answer itself is the user turn.

export const RUBRIC_PROMPT = `You judge how an AI answer engine's reply treats ONE brand. Rubric ${RUBRIC_VERSION}.

The one rule above all others: judge the stance TOWARD THE BRAND, never the tone of the answer as a whole. An answer that warmly recommends a competitor and ignores the brand is "not_mentioned" for the brand, however glowing it reads. An answer that is dry and factual but tells the reader to choose the brand is positive for the brand.

Stance (the brand only):
- strongly_positive — the brand is the clear recommendation or praised without reservation.
- positive — favourable on balance; small caveats at most.
- neutral — described without evaluation (a listing, a fact).
- mixed — real praise and real criticism side by side.
- negative — unfavourable on balance; the reader is steered away.
- strongly_negative — warned off, or the brand is the example of what to avoid.
- not_mentioned — the brand (under any of its names) does not appear.

Recommendation (what the reader is told to do about the brand):
- recommended_outright — "choose this".
- recommended_conditionally — "choose this if…".
- listed_among_options — one of several, no preference expressed.
- mentioned_in_passing — named, but nothing is recommended about it.
- discouraged — the reader is told to look elsewhere.
- not_mentioned.

Confidence: high when the answer is explicit; medium when you infer from framing; low when the signal is thin.

Quotes: every quote must be copied VERBATIM from the answer — one sentence or fragment, under 200 characters, no paraphrase, no ellipsis joins. A finding you cannot quote is a finding you do not have: leave it out. framing_quote is the single sentence that best shows the stance toward the brand (null when not mentioned).

Aspects: up to five things the answer says about the brand specifically (pricing, expertise, service, trust, breadth, convenience, reputation…), each positive or negative, each quoted.

Competitors: EVERY other provider, firm, product or practice the answer names — not only the ones in the profile's known list. An unlisted name is still a competitor: include it with known=false. A name from the profile's list is known=true. This list is how new competitors are discovered, so an answer that names five firms must return five entries. Give each its own stance and recommendation, and quote the sentence that shows how it is framed (null if it is merely listed).

Risk flags, quoted, each with a one-line note:
- factual_concern — a claim about the brand that looks wrong or unverifiable.
- outdated — refers to old pricing, staff, offers or events as current.
- regulatory — mentions licensing, compliance, complaints or legal matters.
- unfavorable_comparison — the brand loses a direct comparison.

Opportunities: at most three concrete things the brand's PR or content team could do, each tied to one finding (basis + basis_index into that list). No generic advice.

Summary: one sentence, under 280 characters, in plain English, about the brand.`

export function profileBlock(profile: BrandProfile): string {
  const comps = profile.competitors.length
    ? profile.competitors.map((c) => `- ${c.name}${c.aliases.length ? ` (also: ${c.aliases.join(', ')})` : ''}`).join('\n')
    : '- (none listed)'
  return `THE BRAND: ${profile.brandName}${profile.aliases.length ? `\nAlso written as: ${profile.aliases.join(', ')}` : ''}${profile.domains.length ? `\nIts domains: ${profile.domains.join(', ')}` : ''}

Known competitors:
${comps}`
}

export function userTurn(input: { engine: string; prompt: string; text: string }): string {
  return `Answer engine: ${input.engine}
Question asked: ${input.prompt}

The answer, verbatim:
<answer>
${input.text}
</answer>

Judge it against the rubric and reply with the JSON object only.`
}
