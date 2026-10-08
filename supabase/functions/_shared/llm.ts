// The model registry and the structured-output call the judge uses.
//
// MODEL_REGISTRY carries a price per model so every stored row can say
// what it cost. Prices are cents per million tokens and were copied from
// the vendors' public price tables when this file was written; check them
// against the current tables before trusting the cost columns, and add a
// row for any model you point the judge or an engine at.

import Anthropic from 'npm:@anthropic-ai/sdk@0.109.0'

export type Provider = 'anthropic' | 'openai'

/** Cents per MTok. Prompt-cache multipliers apply to the input rate. */
export const MODEL_REGISTRY = {
  'claude-haiku-4-5': { provider: 'anthropic', label: 'Claude Haiku 4.5', inCents: 100, outCents: 500, cacheWriteX: 1.25, cacheReadX: 0.1 },
  'claude-sonnet-5-5': { provider: 'anthropic', label: 'Claude Sonnet 5.5', inCents: 200, outCents: 1000, cacheWriteX: 1.25, cacheReadX: 0.1, thinks: true },
  'claude-opus-5-5': { provider: 'anthropic', label: 'Claude Opus 5.5', inCents: 400, outCents: 2000, cacheWriteX: 1.25, cacheReadX: 0.05, thinks: true },
  'gpt-5.2': { provider: 'openai', label: 'GPT-5.2', inCents: 175, outCents: 1400, cacheWriteX: 1, cacheReadX: 0.1 },
  'gpt-5-mini': { provider: 'openai', label: 'GPT-5 mini', inCents: 25, outCents: 200, cacheWriteX: 1, cacheReadX: 0.1 },
} as const satisfies Record<
  string,
  {
    provider: Provider
    label: string
    inCents: number
    outCents: number
    cacheWriteX: number
    cacheReadX: number
    /** Anthropic: the model always thinks, and thinking spends max_tokens. */
    thinks?: boolean
  }
>

export type ModelId = keyof typeof MODEL_REGISTRY

export function isModelId(v: unknown): v is ModelId {
  return typeof v === 'string' && v in MODEL_REGISTRY
}

export type Usage = { input: number; output: number; cacheWrite: number; cacheRead: number }

export const zeroUsage = (): Usage => ({ input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
  }
}

export const usageTokens = (u: Usage) => u.input + u.output + u.cacheWrite + u.cacheRead

/** Ceil, so cents never under-report. */
export function costCents(model: ModelId, u: Usage): number {
  return Math.ceil(costMillicents(model, u) / 1000)
}

/** Millicents, for tables that count sub-cent work (results, analyses). */
export function costMillicents(model: ModelId, u: Usage): number {
  const m = MODEL_REGISTRY[model]
  const perTok = 1 / 1_000_000
  return Math.ceil(
    1000 *
      (u.input * m.inCents * perTok +
        u.output * m.outCents * perTok +
        u.cacheWrite * m.inCents * m.cacheWriteX * perTok +
        u.cacheRead * m.inCents * m.cacheReadX * perTok),
  )
}

export type Completion = {
  text: string
  json: Record<string, unknown> | null
  usage: Usage
  costCents: number
  stopReason: string | null
}

export type StructuredOptions = {
  model: ModelId
  apiKey: string
  /** Stable prefix — cached. */
  system: string
  /** Varies per call (the brand profile, the answer); sits after the cache point. */
  systemTail?: string
  user: string
  /** JSON Schema the reply is held to (output_config.format). */
  schema: Record<string, unknown>
  effort?: 'low' | 'medium' | 'high'
  maxTokens?: number
  signal?: AbortSignal
}

/**
 * A structured reply held to a JSON schema, from either provider:
 * Anthropic through `output_config.format` (with the server-side refusal
 * fallback opted in), OpenAI through the Responses API's `json_schema`
 * text format. `json` is null when the model's text was not the JSON it
 * was held to.
 */
export async function completeStructured(opts: StructuredOptions): Promise<Completion> {
  const spec = MODEL_REGISTRY[opts.model]
  if (spec.provider === 'openai') return completeStructuredOpenAI(opts)
  const anthropic = new Anthropic({ apiKey: opts.apiKey, maxRetries: 3 })
  const system: Array<Record<string, unknown>> = [
    { type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } },
  ]
  if (opts.systemTail) system.push({ type: 'text', text: opts.systemTail })
  const params = {
    model: opts.model,
    max_tokens: Math.max(opts.maxTokens ?? 4_000, (spec as { thinks?: boolean }).thinks ? 8_000 : 0),
    system,
    messages: [{ role: 'user', content: opts.user }],
    output_config: { format: { type: 'json_schema', schema: opts.schema }, effort: opts.effort ?? 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    // The scalar form; the SDK pinned here types only the array form.
    fallbacks: 'default',
  }
  const res = await anthropic.beta.messages
    .stream(params as unknown as Parameters<typeof anthropic.beta.messages.stream>[0], { signal: opts.signal })
    .finalMessage()
  if ((res.stop_reason as string) === 'refusal') throw new Error(`${opts.model} declined the request (refusal)`)
  const usage: Usage = {
    input: res.usage.input_tokens,
    output: res.usage.output_tokens,
    cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
    cacheRead: res.usage.cache_read_input_tokens ?? 0,
  }
  const text = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
  let json: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(text)
    json = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    json = null
  }
  return { text, json, usage, stopReason: res.stop_reason ?? null, costCents: costCents(opts.model, usage) }
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504])
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function completeStructuredOpenAI(opts: StructuredOptions): Promise<Completion> {
  const body: Record<string, unknown> = {
    model: opts.model,
    instructions: opts.systemTail ? `${opts.system}\n\n${opts.systemTail}` : opts.system,
    input: opts.user,
    // Reasoning models spend output tokens thinking before they write; the
    // cap covers both.
    max_output_tokens: Math.max(opts.maxTokens ?? 4_000, 6_000),
    reasoning: { effort: opts.effort ?? 'medium' },
    store: false,
    text: { format: { type: 'json_schema', name: 'judgment', schema: opts.schema, strict: false } },
  }
  let res: Response | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts.signal,
      })
    } catch (e) {
      if (opts.signal?.aborted || attempt === 3) throw e
      await wait(800 * 2 ** attempt)
      continue
    }
    if (res.ok) break
    if (RETRYABLE.has(res.status) && attempt < 3) {
      const hinted = parseInt(res.headers.get('retry-after') ?? '', 10)
      await wait(hinted ? hinted * 1000 : 900 * 2 ** attempt)
      continue
    }
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenAI responses failed (${res.status}): ${detail.slice(0, 300)}`)
  }
  const data = (await res!.json()) as {
    status?: string
    output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>
    usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } }
    incomplete_details?: { reason?: string }
  }
  const text = (data.output ?? [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text ?? '')
    .join('\n')
    .trim()
  const cached = data.usage?.input_tokens_details?.cached_tokens ?? 0
  const usage: Usage = {
    input: Math.max(0, (data.usage?.input_tokens ?? 0) - cached),
    output: data.usage?.output_tokens ?? 0,
    cacheWrite: 0,
    cacheRead: cached,
  }
  let json: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(text)
    json = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    json = null
  }
  const stopReason = data.status === 'incomplete' ? (data.incomplete_details?.reason ?? 'incomplete') : (data.status ?? null)
  return { text, json, usage, stopReason, costCents: costCents(opts.model, usage) }
}
