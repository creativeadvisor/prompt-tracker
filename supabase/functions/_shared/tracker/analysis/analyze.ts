import type { BrandProfile, Citation } from '../engines/types.ts'
import { extract, type Extract } from './extract.ts'
import { judgeAnswer, judgeKeyName, resolveJudgeModel } from './judge.ts'
import { mockJudgment } from './judge-mock.ts'
import { RUBRIC_VERSION, STANCE_SCORE, type Judgment } from './schema.ts'
import { validateJudgment } from './validate.ts'

// The per-result analysis the run loop, the manual action and the analyze
// action all call: extract → judge (the mock without a key) → one
// analyses row per rubric × judge. Every answer with text is judged: the
// answer where the brand is absent and strangers win is the one most worth
// reading, and the judge is how new competitors are discovered and offered
// in Settings.

export { RUBRIC_VERSION }

/** Where an analysis row goes: the user path inserts under RLS, the sweep
 *  path calls a definer RPC. Returns an error message or null. */
export interface AnalysisWriter {
  recordAnalysis(row: Record<string, unknown>): Promise<string | null>
}

export interface AnalyzeInput {
  resultId: string
  brandId: string
  engine: string
  prompt: string
  text: string
  citations: Citation[]
  profile: BrandProfile
  /** False = sentiment analysis is off for this brand: the extract facts
   *  are stored and neither the real nor the mock judge runs. */
  judge: boolean
  judgeModel: string
  env: (key: string) => string | undefined
  /** Re-judge even if an analysis for this rubric exists. */
  force?: boolean
}

export interface AnalyzeOutcome {
  judge: 'model' | 'mock' | 'none'
  costMillicents: number
  error?: string
}

function summarizeExtract(x: Extract) {
  const owners = { brand: 0, competitor: 0, third_party: 0 }
  for (const c of x.citations) owners[c.owner]++
  return {
    competitor_counts: Object.fromEntries(x.competitors.map((c) => [c.name, c.count])),
    citation_owners: owners,
    word_count: x.wordCount,
    paragraph_count: x.paragraphCount,
  }
}

export async function analyzeResult(writer: AnalysisWriter, input: AnalyzeInput): Promise<AnalyzeOutcome> {
  const x = extract(input.text, input.citations, input.profile)
  const hasText = input.text.trim().length >= 20 && input.judge
  const judgeModel = resolveJudgeModel(input.judgeModel)
  const apiKey = input.env(judgeKeyName(judgeModel))

  let judge: AnalyzeOutcome['judge'] = 'none'
  let model: string | null = null
  let judgment: Judgment | null = null
  let dropped: Record<string, number> = {}
  let usage: unknown = null
  let costMillicents = 0
  let error: string | undefined

  if (hasText && apiKey) {
    try {
      const r = await judgeAnswer({
        apiKey,
        model: judgeModel,
        engine: input.engine,
        prompt: input.prompt,
        text: input.text,
        profile: input.profile,
        signal: AbortSignal.timeout(90_000),
      })
      judge = 'model'
      model = r.model
      judgment = r.judgment
      dropped = r.dropped
      usage = r.usage
      costMillicents = r.costMillicents
    } catch (e) {
      // A judge failure is recorded on the row, not thrown: the answer is
      // still stored and the extract facts still stand.
      error = e instanceof Error ? e.message : String(e)
    }
  }
  if (hasText && !judgment && !apiKey) {
    const v = validateJudgment(mockJudgment(input.text, x, input.profile), input.text, input.profile.competitors.map((c) => c.name))
    judge = 'mock'
    model = 'judge-mock-v1'
    judgment = v.judgment
    dropped = v.dropped
  }

  const stance = judgment?.brand.stance ?? 'not_mentioned'
  const row = {
    result_id: input.resultId,
    brand_id: input.brandId,
    rubric_version: RUBRIC_VERSION,
    judge,
    model,
    brand_mentioned: x.brand.count > 0,
    mention_count: x.brand.count,
    mention_position: x.brand.first?.offset ?? null,
    mention_paragraph: x.brand.paragraph,
    mention_rank: x.brandRank,
    named_count: x.namedCount,
    structure: x.structure,
    stance_label: stance,
    stance_score: STANCE_SCORE[stance],
    recommendation: judgment?.brand.recommendation ?? 'not_mentioned',
    confidence: judgment?.brand.confidence ?? null,
    summary: judgment?.summary ?? null,
    payload: { judgment, dropped, ...summarizeExtract(x), ...(error ? { judge_error: error } : {}) },
    usage,
    cost_millicents: costMillicents,
  }
  // The writer deletes any row for this rubric × judge first, then inserts
  // (an upsert's ON CONFLICT DO UPDATE would read the excluded row's
  // cost columns, which app users cannot select).
  const writeErr = await writer.recordAnalysis(row)
  if (writeErr) return { judge, costMillicents, error: writeErr }
  return { judge, costMillicents, error }
}
