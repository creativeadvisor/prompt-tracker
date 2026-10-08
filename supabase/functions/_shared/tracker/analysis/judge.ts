import { completeStructured, costMillicents, isModelId, MODEL_REGISTRY, type ModelId, type Usage } from '../../llm.ts'
import type { BrandProfile } from '../engines/types.ts'
import { JUDGMENT_SCHEMA } from './schema.ts'
import { profileBlock, RUBRIC_PROMPT, userTurn } from './prompt.ts'
import { validateJudgment, type Validated } from './validate.ts'

// Layer 2 of the sentiment design: one model call per answer,
// held to JUDGMENT_SCHEMA, then validated — every quote must be in the
// text. The rubric is the cached prefix; the brand profile rides after it.

export const DEFAULT_JUDGE: ModelId = 'claude-sonnet-5-5'

export interface JudgeResult extends Validated {
  model: ModelId
  usage: Usage
  costMillicents: number
  stopReason: string | null
}

export function resolveJudgeModel(v: unknown): ModelId {
  return isModelId(v) ? v : DEFAULT_JUDGE
}

/** The function secret that holds the key for a judge model's provider. */
export function judgeKeyName(model: ModelId): 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY' {
  return MODEL_REGISTRY[model].provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
}

export async function judgeAnswer(input: {
  apiKey: string
  model: ModelId
  engine: string
  prompt: string
  text: string
  profile: BrandProfile
  signal?: AbortSignal
}): Promise<JudgeResult> {
  const res = await completeStructured({
    model: input.model,
    apiKey: input.apiKey,
    system: RUBRIC_PROMPT,
    systemTail: profileBlock(input.profile),
    user: userTurn({ engine: input.engine, prompt: input.prompt, text: input.text }),
    schema: JUDGMENT_SCHEMA,
    effort: 'medium',
    maxTokens: 4_000,
    signal: input.signal,
  })
  if (!res.json) throw new Error(`judge returned no JSON (stop: ${res.stopReason ?? 'unknown'})`)
  const validated = validateJudgment(res.json, input.text, input.profile.competitors.map((c) => c.name))
  return {
    ...validated,
    model: input.model,
    usage: res.usage,
    costMillicents: costMillicents(input.model, res.usage),
    stopReason: res.stopReason,
  }
}
