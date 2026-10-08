// The answer-engine seam: one
// shape for every engine so the run loop, the extract layer and the judge
// never know which vendor answered. A real engine (DataForSEO, OpenAI,
// Gemini, Anthropic) and the mock implement the same interface.

export type EngineId =
  | 'mock'
  | 'manual'
  | 'google_ai_overview'
  | 'chatgpt'
  | 'gemini'
  | 'claude'

export const ENGINE_IDS: readonly EngineId[] = [
  'mock',
  'manual',
  'google_ai_overview',
  'chatgpt',
  'gemini',
  'claude',
]

export const isEngineId = (v: unknown): v is EngineId =>
  typeof v === 'string' && (ENGINE_IDS as readonly string[]).includes(v)

/** What the extract layer and the mock need to know about the brand. */
export interface BrandProfile {
  brandName: string
  aliases: string[]
  domains: string[]
  competitors: Array<{ name: string; aliases: string[]; domains: string[] }>
}

export interface EngineInput {
  prompt: string
  /** ISO 3166-1 alpha-2, lower case (search locale). */
  country: string
  /** ISO 639-1, lower case. */
  language: string
  /** Only the mock reads this — a real engine never sees the brand. */
  profile: BrandProfile
}

export interface EngineContext {
  env: (key: string) => string | undefined
  signal: AbortSignal
}

export interface Citation {
  url: string
  title?: string
  domain: string
  /** 1-based order in the engine's own source list. */
  position: number
}

export interface Usage {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

export interface EngineAnswer {
  /** The answer as the engine gave it, markdown-ish plain text. */
  text: string
  citations: Citation[]
  /** The vendor's model or product name, when it says. */
  model?: string
  /** The vendor's own payload, stored platform-only. */
  raw: unknown
  usage?: Usage
  costMillicents: number
  /** The engine was reached but its surface showed nothing for the query
   *  (Google rendered no AI Overview): stored as status `no_answer`, not
   *  judged, not an answer in the dashboards. `text` is empty. */
  empty?: boolean
}

export interface AnswerEngine {
  id: EngineId
  label: string
  /** Throws EngineUnavailable when the key it needs is not set. */
  fetch(input: EngineInput, ctx: EngineContext): Promise<EngineAnswer>
}

/** The engine cannot answer at all right now (no key, not wired yet) —
 *  recorded as status `unavailable`, distinct from a request that failed. */
export class EngineUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngineUnavailable'
  }
}

/** `https://www.Example.com/a/b?c` → `example.com`. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return url
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^www\./, '')
      .split(/[/?#]/)[0]
  }
}
