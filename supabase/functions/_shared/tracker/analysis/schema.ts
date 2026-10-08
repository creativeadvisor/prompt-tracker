// The judge's output (layer 2 of the sentiment design). Enums,
// not floats: an LLM's "0.37" is noise, its "positive, high confidence"
// is signal. Every quote must be a verbatim substring of the answer —
// validate.ts enforces that and drops what fails, so the UI never shows
// evidence the model invented.

export const RUBRIC_VERSION = '2026.10.1'

export const STANCES = [
  'strongly_positive',
  'positive',
  'neutral',
  'mixed',
  'negative',
  'strongly_negative',
  'not_mentioned',
] as const
export type Stance = (typeof STANCES)[number]

export const RECOMMENDATIONS = [
  'recommended_outright',
  'recommended_conditionally',
  'listed_among_options',
  'mentioned_in_passing',
  'discouraged',
  'not_mentioned',
] as const
export type Recommendation = (typeof RECOMMENDATIONS)[number]

export const CONFIDENCES = ['low', 'medium', 'high'] as const
export type Confidence = (typeof CONFIDENCES)[number]

export const RISK_TYPES = ['factual_concern', 'outdated', 'regulatory', 'unfavorable_comparison'] as const
export type RiskType = (typeof RISK_TYPES)[number]

export const STANCE_SCORE: Record<Stance, number> = {
  strongly_positive: 1,
  positive: 0.5,
  neutral: 0,
  mixed: 0,
  negative: -0.5,
  strongly_negative: -1,
  not_mentioned: 0,
}

export interface Judgment {
  brand: {
    mentioned: boolean
    stance: Stance
    recommendation: Recommendation
    confidence: Confidence
    /** One verbatim sentence that best shows the stance; null when not mentioned. */
    framing_quote: string | null
  }
  /** ≤ 5, each with a verbatim quote. */
  aspects: Array<{ aspect: string; polarity: 'positive' | 'negative'; quote: string }>
  competitors: Array<{
    name: string
    /** In the profile's list (true) or newly seen in this answer (false). */
    known: boolean
    stance: Stance
    recommendation: Recommendation
    quote: string | null
  }>
  risk_flags: Array<{ type: RiskType; quote: string; note: string }>
  /** ≤ 3, each tied to a finding above. */
  opportunities: Array<{ text: string; basis: 'aspect' | 'competitor' | 'risk_flag'; basis_index: number }>
  /** ≤ 280 characters. */
  summary: string
}

/** The JSON Schema the judge is held to (strict: every object closed, every
 *  property required — nulls say "none"). */
export const JUDGMENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['brand', 'aspects', 'competitors', 'risk_flags', 'opportunities', 'summary'],
  properties: {
    brand: {
      type: 'object',
      additionalProperties: false,
      required: ['mentioned', 'stance', 'recommendation', 'confidence', 'framing_quote'],
      properties: {
        mentioned: { type: 'boolean' },
        stance: { type: 'string', enum: [...STANCES] },
        recommendation: { type: 'string', enum: [...RECOMMENDATIONS] },
        confidence: { type: 'string', enum: [...CONFIDENCES] },
        framing_quote: { type: ['string', 'null'] },
      },
    },
    aspects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['aspect', 'polarity', 'quote'],
        properties: {
          aspect: { type: 'string' },
          polarity: { type: 'string', enum: ['positive', 'negative'] },
          quote: { type: 'string' },
        },
      },
    },
    competitors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'known', 'stance', 'recommendation', 'quote'],
        properties: {
          name: { type: 'string' },
          known: { type: 'boolean' },
          stance: { type: 'string', enum: [...STANCES] },
          recommendation: { type: 'string', enum: [...RECOMMENDATIONS] },
          quote: { type: ['string', 'null'] },
        },
      },
    },
    risk_flags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'quote', 'note'],
        properties: {
          type: { type: 'string', enum: [...RISK_TYPES] },
          quote: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    opportunities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'basis', 'basis_index'],
        properties: {
          text: { type: 'string' },
          basis: { type: 'string', enum: ['aspect', 'competitor', 'risk_flag'] },
          basis_index: { type: 'integer' },
        },
      },
    },
    summary: { type: 'string' },
  },
}
