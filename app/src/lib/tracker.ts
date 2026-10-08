import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Json, Tables } from './database.types'

// The app's data layer: the queryOptions factories and the writes,
// snake→camel at the boundary, the brand id in every key. RLS keeps other
// people's rows out; the brand filter keeps one brand's rows apart from
// another's.

// ---------------------------------------------------------------- engines

export type EngineId =
  | 'mock'
  | 'manual'
  | 'google_ai_overview'
  | 'chatgpt'
  | 'gemini'
  | 'claude'

export interface EngineInfo {
  id: EngineId
  label: string
  /** Short form for dense columns. */
  short: string
  /** What stands behind it — shown in Settings so nobody mistakes a
   *  simulation for the real thing (the reference's gpt-4o "ChatGPT"). */
  source: string
  /** Needs a key in the Edge Function's env before it answers. */
  needsKey: boolean
  /** Not offered in pickers (mock: development only; manual: pasted via
   *  the prompt page's button). Still labelled wherever it is stored. */
  hidden?: boolean
}

export const ENGINES: readonly EngineInfo[] = [
  { id: 'google_ai_overview', label: 'Google AI Overview', short: 'Google', source: 'DataForSEO SERP (SerpAPI alternate)', needsKey: true },
  { id: 'chatgpt', label: 'ChatGPT', short: 'ChatGPT', source: 'OpenAI Responses API with web search', needsKey: true },
  { id: 'gemini', label: 'Gemini', short: 'Gemini', source: 'Gemini API with Google Search grounding', needsKey: true },
  { id: 'claude', label: 'Claude', short: 'Claude', source: 'Anthropic Messages API with web search', needsKey: true },
  { id: 'manual', label: 'Manual paste', short: 'Manual', source: 'An answer you paste in (Perplexity, AI Mode, screenshots)', needsKey: false, hidden: true },
  { id: 'mock', label: 'Mock', short: 'Mock', source: 'Deterministic fixtures for development', needsKey: false, hidden: true },
]

export const ENGINE_BY_ID: Record<EngineId, EngineInfo> = Object.fromEntries(
  ENGINES.map((e) => [e.id, e]),
) as Record<EngineId, EngineInfo>

export const isEngineId = (v: unknown): v is EngineId =>
  typeof v === 'string' && v in ENGINE_BY_ID

export const engineLabel = (id: string) => (isEngineId(id) ? ENGINE_BY_ID[id].label : id)

// ----------------------------------------------------------------- brands

export interface Competitor {
  name: string
  aliases: string[]
  domains: string[]
}

export interface BrandProfile {
  id: string
  brandName: string
  aliases: string[]
  domains: string[]
  competitors: Competitor[]
  marketCountry: string
  marketLanguage: string
  defaultEngines: EngineId[]
  /** Sentiment analysis (the LLM judge) on or off for this brand. */
  judgeEnabled: boolean
  judgeModel: string
  createdAt: string
  updatedAt: string
}

/** Judge models the Settings dropdown offers. Each needs its provider's key
 *  in the function secrets; without it the keyless mock judge runs. Keep in
 *  step with MODEL_REGISTRY (supabase/functions/_shared/llm.ts). */
export const JUDGE_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', provider: 'Anthropic', note: 'default' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'Anthropic', note: 'cheapest' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'Anthropic', note: 'about 2× Sonnet' },
  { id: 'gpt-5.2', label: 'GPT-5.2', provider: 'OpenAI', note: '' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', provider: 'OpenAI', note: 'cheapest' },
] as const

function parseCompetitors(v: Json): Competitor[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((c) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return []
    const o = c as Record<string, Json | undefined>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    if (!name) return []
    const strs = (x: Json | undefined) =>
      Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []
    return [{ name, aliases: strs(o.aliases), domains: strs(o.domains) }]
  })
}

function mapProfile(row: Tables<'brands'>): BrandProfile {
  return {
    id: row.id,
    brandName: row.name,
    aliases: row.aliases,
    domains: row.domains,
    competitors: parseCompetitors(row.competitors),
    marketCountry: row.market_country,
    marketLanguage: row.market_language,
    defaultEngines: row.default_engines.filter(isEngineId),
    judgeEnabled: row.judge_enabled,
    judgeModel: row.judge_model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const byName = (a: BrandProfile, b: BrandProfile) => a.brandName.localeCompare(b.brandName)

/** Every brand the signed-in user owns, A→Z. */
export const brandsQueryOptions = queryOptions({
  queryKey: ['brands'],
  queryFn: async (): Promise<BrandProfile[]> => {
    const { data, error } = await supabase.from('brands').select('*').order('name')
    if (error) throw error
    return (data ?? []).map(mapProfile)
  },
  staleTime: 60_000,
})

/** One brand: the profile the extract layer and the judge read. */
export const profileQueryOptions = (brandId: string) =>
  queryOptions({
    queryKey: ['brand', brandId],
    queryFn: async (): Promise<BrandProfile | null> => {
      const { data, error } = await supabase.from('brands').select('*').eq('id', brandId).maybeSingle()
      if (error) throw error
      return data ? mapProfile(data) : null
    },
    staleTime: 60_000,
  })

/** Create a brand owned by the signed-in user. Everything but the name
 *  starts at its default (US market, English, the mock engine) and is
 *  edited in Settings. */
export async function createBrand(qc: QueryClient, input: { name: string; domain?: string }): Promise<BrandProfile> {
  const { data: who } = await supabase.auth.getUser()
  if (!who.user) throw new Error('Not signed in.')
  const domain = normalizeDomain(input.domain ?? '')
  const { data, error } = await supabase
    .from('brands')
    .insert({ owner_id: who.user.id, name: input.name.trim(), domains: domain ? [domain] : [] })
    .select('*')
    .single()
  if (error) throw error
  const brand = mapProfile(data)
  qc.setQueryData(brandsQueryOptions.queryKey, (old) => [...(old ?? []), brand].sort(byName))
  qc.setQueryData(profileQueryOptions(brand.id).queryKey, brand)
  return brand
}

export interface ProfileInput {
  brandName: string
  aliases: string[]
  domains: string[]
  competitors: Competitor[]
  marketCountry: string
  marketLanguage: string
  defaultEngines: EngineId[]
  judgeEnabled: boolean
  judgeModel: string
}

export async function saveProfile(qc: QueryClient, brandId: string, input: ProfileInput): Promise<BrandProfile> {
  const { data, error } = await supabase
    .from('brands')
    .update({
      name: input.brandName.trim(),
      aliases: input.aliases,
      domains: input.domains.map(normalizeDomain).filter(Boolean),
      competitors: input.competitors.map((c) => ({
        name: c.name.trim(),
        aliases: c.aliases,
        domains: c.domains.map(normalizeDomain).filter(Boolean),
      })),
      market_country: input.marketCountry,
      market_language: input.marketLanguage,
      default_engines: input.defaultEngines,
      judge_enabled: input.judgeEnabled,
      judge_model: input.judgeModel,
    })
    .eq('id', brandId)
    .select('*')
    .single()
  if (error) throw error
  const brand = mapProfile(data)
  qc.setQueryData(profileQueryOptions(brandId).queryKey, brand)
  qc.setQueryData(brandsQueryOptions.queryKey, (old) => (old ?? []).map((b) => (b.id === brandId ? brand : b)).sort(byName))
  return brand
}

/** Delete a brand and, by cascade, its prompts, runs, answers and analyses. */
export async function deleteBrand(qc: QueryClient, brandId: string): Promise<void> {
  const { error } = await supabase.from('brands').delete().eq('id', brandId)
  if (error) throw error
  qc.setQueryData(brandsQueryOptions.queryKey, (old) => (old ?? []).filter((b) => b.id !== brandId))
  qc.removeQueries({ queryKey: ['brand', brandId] })
}

/** `https://www.Example.com/path` → `example.com`. */
export function normalizeDomain(raw: string): string {
  let s = raw.trim().toLowerCase()
  if (!s) return ''
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '')
  s = s.split(/[/?#]/)[0]
  return s
}

/** "a, b; c" → ["a", "b", "c"] (trimmed, deduped, empties dropped). */
export function splitList(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(/[,;\n]/)) {
    const s = part.trim()
    if (s) seen.add(s)
  }
  return [...seen]
}

// ---------------------------------------------------------------- prompts

export type PromptStatus = 'active' | 'paused' | 'archived'

export interface TrackedPrompt {
  id: string
  brandId: string
  promptText: string
  tags: string[]
  engines: EngineId[]
  status: PromptStatus
  createdAt: string
  updatedAt: string
}

function mapPrompt(row: Tables<'prompts'>): TrackedPrompt {
  return {
    id: row.id,
    brandId: row.brand_id,
    promptText: row.prompt_text,
    tags: row.tags,
    engines: row.engines.filter(isEngineId),
    status: row.status as PromptStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const promptsQueryOptions = (brandId: string) =>
  queryOptions({
    queryKey: ['prompts', brandId],
    queryFn: async (): Promise<TrackedPrompt[]> => {
      const { data, error } = await supabase
        .from('prompts')
        .select('*')
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapPrompt)
    },
    staleTime: 30_000,
  })

export interface NewPrompt {
  promptText: string
  tags: string[]
  engines: EngineId[]
}

/** Bulk-safe: one insert for N prompts; duplicates of an existing prompt
 *  text for this brand are skipped rather than failing the batch. */
export async function createPrompts(
  qc: QueryClient,
  brandId: string,
  inputs: NewPrompt[],
): Promise<{ created: TrackedPrompt[]; skipped: number }> {
  const existing = qc.getQueryData(promptsQueryOptions(brandId).queryKey) ?? []
  const have = new Set(existing.map((p) => p.promptText.toLowerCase()))
  const seen = new Set<string>()
  const rows = []
  let skipped = 0
  for (const i of inputs) {
    const text = cleanPromptText(i.promptText)
    const key = text.toLowerCase()
    if (text.length < 3 || have.has(key) || seen.has(key)) {
      skipped++
      continue
    }
    seen.add(key)
    rows.push({
      brand_id: brandId,
      prompt_text: text,
      tags: i.tags,
      engines: i.engines,
    })
  }
  if (rows.length === 0) return { created: [], skipped }
  const { data, error } = await supabase.from('prompts').insert(rows).select('*')
  if (error) throw error
  const created = (data ?? []).map(mapPrompt)
  qc.setQueryData(promptsQueryOptions(brandId).queryKey, [...created, ...existing])
  return { created, skipped }
}

/** A pasted line, minus list bullets and numbering. */
export function cleanPromptText(raw: string): string {
  return raw.replace(/^[\s*\-•\d.)]+/, '').replace(/\s+/g, ' ').trim().slice(0, 500)
}

export async function updatePrompt(
  qc: QueryClient,
  prompt: TrackedPrompt,
  patch: Partial<Pick<TrackedPrompt, 'tags' | 'engines' | 'status' | 'promptText'>>,
): Promise<TrackedPrompt> {
  const { data, error } = await supabase
    .from('prompts')
    .update({
      ...(patch.tags ? { tags: patch.tags } : {}),
      ...(patch.engines ? { engines: patch.engines } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.promptText ? { prompt_text: cleanPromptText(patch.promptText) } : {}),
    })
    .eq('id', prompt.id)
    .select('*')
    .single()
  if (error) throw error
  const next = mapPrompt(data)
  qc.setQueryData(promptsQueryOptions(prompt.brandId).queryKey, (old) =>
    (old ?? []).map((p) => (p.id === next.id ? next : p)),
  )
  return next
}

export async function deletePrompt(qc: QueryClient, prompt: TrackedPrompt): Promise<void> {
  const { error } = await supabase.from('prompts').delete().eq('id', prompt.id)
  if (error) throw error
  qc.setQueryData(promptsQueryOptions(prompt.brandId).queryKey, (old) =>
    (old ?? []).filter((p) => p.id !== prompt.id),
  )
}

/** Every tag in use for a brand, most used first. */
export function tagCounts(prompts: TrackedPrompt[]): Array<{ tag: string; count: number }> {
  const m = new Map<string, number>()
  for (const p of prompts) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1)
  return [...m.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

// ---------------------------------------------------------------- results

/** `no_answer`: the engine was reached but showed nothing (Google rendered
 *  no AI Overview) — not judged, not an answer in the dashboards. */
export type ResultStatus = 'ok' | 'failed' | 'unavailable' | 'no_answer'

export interface ResultCitation {
  url: string
  title?: string
  domain: string
  position: number
}

export interface AnswerResult {
  id: string
  runId: string | null
  promptId: string
  brandId: string
  engine: EngineId | string
  engineModel: string | null
  status: ResultStatus
  error: string | null
  responseText: string | null
  citations: ResultCitation[]
  fetchedAt: string
}

type ResultRow = Omit<Tables<'results'>, 'raw'>

function parseCitations(v: Json): ResultCitation[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((c) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return []
    const o = c as Record<string, Json | undefined>
    const url = typeof o.url === 'string' ? o.url : ''
    if (!url) return []
    return [
      {
        url,
        title: typeof o.title === 'string' ? o.title : undefined,
        domain: typeof o.domain === 'string' && o.domain ? o.domain : domainOf(url),
        position: typeof o.position === 'number' ? o.position : 0,
      },
    ]
  })
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return normalizeDomain(url)
  }
}

function mapResult(row: ResultRow): AnswerResult {
  return {
    id: row.id,
    runId: row.run_id,
    promptId: row.prompt_id,
    brandId: row.brand_id,
    engine: row.engine,
    engineModel: row.engine_model,
    status: row.status as ResultStatus,
    error: row.error,
    responseText: row.response_text,
    citations: parseCitations(row.citations),
    fetchedAt: row.fetched_at,
  }
}

const RESULT_COLUMNS =
  'id, run_id, prompt_id, brand_id, engine, engine_model, status, error, response_text, citations, cost_millicents, fetched_at'

/** Every result for one prompt, newest first. */
export const promptResultsQueryOptions = (promptId: string) =>
  queryOptions({
    queryKey: ['results', 'prompt', promptId],
    queryFn: async (): Promise<AnswerResult[]> => {
      const { data, error } = await supabase
        .from('results')
        .select(RESULT_COLUMNS)
        .eq('prompt_id', promptId)
        .order('fetched_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapResult)
    },
    staleTime: 15_000,
  })

/** Every result for a brand (the overview, the prompt table's latest
 *  columns). Capped. */
export const brandResultsQueryOptions = (brandId: string) =>
  queryOptions({
    queryKey: ['results', 'brand', brandId],
    queryFn: async (): Promise<AnswerResult[]> => {
      const { data, error } = await supabase
        .from('results')
        .select(RESULT_COLUMNS)
        .eq('brand_id', brandId)
        .order('fetched_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      return (data ?? []).map(mapResult)
    },
    staleTime: 15_000,
  })

/** The newest result per prompt × engine. */
export function latestByPromptEngine(results: AnswerResult[]): Map<string, AnswerResult> {
  const m = new Map<string, AnswerResult>()
  for (const r of results) {
    const k = `${r.promptId}:${r.engine}`
    if (!m.has(k)) m.set(k, r) // results arrive newest first
  }
  return m
}

// ------------------------------------------------------------------ runs

export type RunStatus = 'running' | 'succeeded' | 'failed'

export interface RunUnit {
  prompt_id: string
  engine: string
  result_id?: string
  status: 'ok' | 'failed' | 'unavailable' | 'no_answer'
  error?: string
}

export interface Run {
  id: string
  brandId: string
  status: RunStatus
  error: string | null
  trigger: string
  batchId: string | null
  promptIds: string[]
  engines: string[]
  unitCount: number
  units: RunUnit[]
  createdAt: string
  finishedAt: string | null
}

function mapRun(row: Pick<Tables<'runs'>, 'id' | 'brand_id' | 'status' | 'error' | 'input' | 'output' | 'created_at' | 'finished_at'>): Run {
  const input = (row.input && typeof row.input === 'object' && !Array.isArray(row.input) ? row.input : {}) as Record<string, Json | undefined>
  const output = (row.output && typeof row.output === 'object' && !Array.isArray(row.output) ? row.output : {}) as Record<string, Json | undefined>
  const strs = (v: Json | undefined) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])
  const units = Array.isArray(output.units)
    ? output.units.flatMap((u) => {
        if (!u || typeof u !== 'object' || Array.isArray(u)) return []
        const o = u as Record<string, Json | undefined>
        return [
          {
            prompt_id: String(o.prompt_id ?? ''),
            engine: String(o.engine ?? ''),
            result_id: typeof o.result_id === 'string' ? o.result_id : undefined,
            status: (o.status === 'failed' || o.status === 'unavailable' || o.status === 'no_answer' ? o.status : 'ok') as RunUnit['status'],
            error: typeof o.error === 'string' ? o.error : undefined,
          },
        ]
      })
    : []
  return {
    id: row.id,
    brandId: row.brand_id,
    status: row.status as RunStatus,
    error: row.error,
    trigger: typeof input.trigger === 'string' ? input.trigger : 'manual',
    batchId: typeof input.batch_id === 'string' ? input.batch_id : null,
    promptIds: strs(input.prompt_ids),
    engines: strs(input.engines),
    unitCount: typeof input.unit_count === 'number' ? input.unit_count : units.length,
    units,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }
}

const RUN_COLUMNS = 'id, brand_id, status, error, input, output, created_at, finished_at'

export const runsQueryOptions = (brandId: string) =>
  queryOptions({
    queryKey: ['runs', brandId],
    queryFn: async (): Promise<Run[]> => {
      const { data, error } = await supabase
        .from('runs')
        .select(RUN_COLUMNS)
        .eq('brand_id', brandId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map(mapRun)
    },
    staleTime: 10_000,
  })

/** One run, polled while it is running. */
export const runQueryOptions = (runId: string) =>
  queryOptions({
    queryKey: ['run', runId],
    queryFn: async (): Promise<Run | null> => {
      const { data, error } = await supabase.from('runs').select(RUN_COLUMNS).eq('id', runId).maybeSingle()
      if (error) throw error
      return data ? mapRun(data) : null
    },
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 1500 : false),
  })

/** Drop every cached result/run for a brand after a run finishes. */
export function invalidateAfterRun(qc: QueryClient, brandId: string) {
  void qc.invalidateQueries({ queryKey: ['results'] })
  void qc.invalidateQueries({ queryKey: ['runs', brandId] })
  void qc.invalidateQueries({ queryKey: ['analyses'] })
}

// ------------------------------------------------------- edge function

export const MAX_UNITS_PER_RUN = 12

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('tracker', { body })
  if (error) {
    // The function answers errors as JSON; surface its message, not the SDK's.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string }
        if (j?.error) throw new Error(j.error)
      } catch (e) {
        if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e
      }
    }
    throw error
  }
  return data as T
}

/**
 * Run prompts on their engines. More than MAX_UNITS_PER_RUN prompt × engine
 * units are chunked into several runs under one batch id; the caller gets
 * every run id to watch.
 */
export async function startRuns(
  prompts: TrackedPrompt[],
  brandId: string,
  engines?: EngineId[],
): Promise<{ runIds: string[]; batchId: string; units: number }> {
  const batchId = crypto.randomUUID()
  const chunks: TrackedPrompt[][] = []
  let cur: TrackedPrompt[] = []
  let curUnits = 0
  for (const p of prompts) {
    const n = (engines ?? p.engines).filter((e) => e !== 'manual').length
    if (n === 0) continue
    if (curUnits + n > MAX_UNITS_PER_RUN && cur.length) {
      chunks.push(cur)
      cur = []
      curUnits = 0
    }
    cur.push(p)
    curUnits += n
  }
  if (cur.length) chunks.push(cur)
  const runIds: string[] = []
  let units = 0
  for (const chunk of chunks) {
    const res = await invoke<{ run_id: string; units: number }>({
      action: 'run',
      brand_id: brandId,
      prompt_ids: chunk.map((p) => p.id),
      ...(engines ? { engines } : {}),
      batch_id: batchId,
    })
    runIds.push(res.run_id)
    units += res.units
  }
  return { runIds, batchId, units }
}

export async function submitManualAnswer(
  brandId: string,
  promptId: string,
  text: string,
  sourceLabel: string,
): Promise<{ runId: string; resultId: string }> {
  const res = await invoke<{ run_id: string; result_id: string }>({
    action: 'manual',
    brand_id: brandId,
    prompt_id: promptId,
    text,
    source_label: sourceLabel,
  })
  return { runId: res.run_id, resultId: res.result_id }
}

export async function reanalyze(brandId: string, resultIds: string[]): Promise<void> {
  await invoke({ action: 'analyze', brand_id: brandId, result_ids: resultIds })
}

// ----------------------------------------------------------- highlight

/** Split text into plain and highlighted segments for the brand and its
 *  aliases (word-boundary, case-insensitive) — the Responses tab's mark. */
export function highlightSegments(
  text: string,
  names: string[],
): Array<{ text: string; hit: boolean }> {
  const forms = names.map((n) => n.trim()).filter((n) => n.length >= 2)
  if (forms.length === 0 || !text) return [{ text, hit: false }]
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
  const out: Array<{ text: string; hit: boolean }> = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0
    if (i > last) out.push({ text: text.slice(last, i), hit: false })
    out.push({ text: m[0], hit: true })
    last = i + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false })
  return out
}

// --------------------------------------------------------------- analyses

export type StanceLabel =
  | 'strongly_positive'
  | 'positive'
  | 'neutral'
  | 'mixed'
  | 'negative'
  | 'strongly_negative'
  | 'not_mentioned'

export type Recommendation =
  | 'recommended_outright'
  | 'recommended_conditionally'
  | 'listed_among_options'
  | 'mentioned_in_passing'
  | 'discouraged'
  | 'not_mentioned'

export type JudgeKind = 'model' | 'mock' | 'none'

export interface Judgment {
  brand: {
    mentioned: boolean
    stance: StanceLabel
    recommendation: Recommendation
    confidence: 'low' | 'medium' | 'high'
    framing_quote: string | null
  }
  aspects: Array<{ aspect: string; polarity: 'positive' | 'negative'; quote: string }>
  competitors: Array<{ name: string; known: boolean; stance: StanceLabel; recommendation: Recommendation; quote: string | null }>
  risk_flags: Array<{ type: 'factual_concern' | 'outdated' | 'regulatory' | 'unfavorable_comparison'; quote: string; note: string }>
  opportunities: Array<{ text: string; basis: 'aspect' | 'competitor' | 'risk_flag'; basis_index: number }>
  summary: string
}

export interface Analysis {
  id: string
  resultId: string
  rubricVersion: string
  judge: JudgeKind
  model: string | null
  brandMentioned: boolean
  mentionCount: number
  mentionPosition: number | null
  mentionParagraph: number | null
  mentionRank: number | null
  namedCount: number
  structure: string | null
  stance: StanceLabel
  stanceScore: number
  recommendation: Recommendation
  confidence: 'low' | 'medium' | 'high' | null
  summary: string | null
  judgment: Judgment | null
  dropped: Record<string, number>
  /** Competitor mention counts from the extract layer, by name. */
  competitorCounts: Record<string, number>
  citationOwners: { brand: number; competitor: number; third_party: number }
  createdAt: string
}

type AnalysisRow = Omit<Tables<'analyses'>, 'usage' | 'cost_millicents'>

function mapAnalysis(row: AnalysisRow): Analysis {
  const p = (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {}) as Record<string, Json | undefined>
  const judgment = p.judgment && typeof p.judgment === 'object' && !Array.isArray(p.judgment) ? (p.judgment as unknown as Judgment) : null
  const nums = (v: Json | undefined): Record<string, number> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === 'number'))
  }
  const owners = nums(p.citation_owners)
  return {
    id: row.id,
    resultId: row.result_id,
    rubricVersion: row.rubric_version,
    judge: row.judge as JudgeKind,
    model: row.model,
    brandMentioned: row.brand_mentioned,
    mentionCount: row.mention_count,
    mentionPosition: row.mention_position,
    mentionParagraph: row.mention_paragraph,
    mentionRank: row.mention_rank,
    namedCount: row.named_count,
    structure: row.structure,
    stance: row.stance_label as StanceLabel,
    stanceScore: Number(row.stance_score),
    recommendation: row.recommendation as Recommendation,
    confidence: (row.confidence as Analysis['confidence']) ?? null,
    summary: row.summary,
    judgment,
    dropped: nums(p.dropped),
    competitorCounts: nums(p.competitor_counts),
    citationOwners: { brand: owners.brand ?? 0, competitor: owners.competitor ?? 0, third_party: owners.third_party ?? 0 },
    createdAt: row.created_at,
  }
}

const ANALYSIS_COLUMNS =
  'id, result_id, brand_id, rubric_version, judge, model, brand_mentioned, mention_count, mention_position, mention_paragraph, mention_rank, named_count, structure, stance_label, stance_score, recommendation, confidence, summary, payload, created_at'

/** The newest analysis per result, for a set of results. */
export const analysesQueryOptions = (resultIds: string[]) =>
  queryOptions({
    queryKey: ['analyses', [...resultIds].sort()],
    enabled: resultIds.length > 0,
    queryFn: async (): Promise<Map<string, Analysis>> => {
      const { data, error } = await supabase
        .from('analyses')
        .select(ANALYSIS_COLUMNS)
        .in('result_id', resultIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      const m = new Map<string, Analysis>()
      for (const row of data ?? []) {
        const a = mapAnalysis(row)
        if (!m.has(a.resultId)) m.set(a.resultId, a)
      }
      return m
    },
    staleTime: 15_000,
  })

export const STANCE_LABELS: Record<StanceLabel, string> = {
  strongly_positive: 'Strongly positive',
  positive: 'Positive',
  neutral: 'Neutral',
  mixed: 'Mixed',
  negative: 'Negative',
  strongly_negative: 'Strongly negative',
  not_mentioned: 'Not mentioned',
}

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  recommended_outright: 'Recommended outright',
  recommended_conditionally: 'Recommended conditionally',
  listed_among_options: 'Listed among options',
  mentioned_in_passing: 'Mentioned in passing',
  discouraged: 'Discouraged',
  not_mentioned: 'Not mentioned',
}

/** The state pair for a stance (tint + ink, both halves). */
export function stanceTone(s: StanceLabel): string {
  switch (s) {
    case 'strongly_positive':
    case 'positive':
      return 'bg-success-soft text-success'
    case 'negative':
    case 'strongly_negative':
      return 'bg-danger-soft text-danger'
    case 'mixed':
      return 'bg-warm-soft text-warm'
    case 'neutral':
      return 'bg-info-soft text-info'
    default:
      return 'bg-surface-2 text-text-soft'
  }
}

export const JUDGE_LABELS: Record<JudgeKind, string> = {
  model: 'Judged',
  mock: 'Mock judgment',
  none: 'Not judged',
}

/** Pill copy for a stance, or "Not judged" when the judge did not run. */
export const stanceOf = (a: Pick<Analysis, 'judge' | 'stance'>): StanceLabel | null => (a.judge === 'none' ? null : a.stance)

// ------------------------------------------------------------------ feed

/** An analysis with the facts of the answer it judged (analysis_feed). */
export interface FeedRow {
  id: string
  resultId: string
  runId: string | null
  promptId: string
  engine: string
  status: ResultStatus
  fetchedAt: string
  judge: JudgeKind
  brandMentioned: boolean
  mentionCount: number
  mentionRank: number | null
  namedCount: number
  stance: StanceLabel
  stanceScore: number
  recommendation: Recommendation
  competitorCounts: Record<string, number>
  citationOwners: { brand: number; competitor: number; third_party: number }
}

export const feedQueryOptions = (brandId: string) =>
  queryOptions({
    queryKey: ['analyses', 'feed', brandId],
    queryFn: async (): Promise<FeedRow[]> => {
      const { data, error } = await supabase
        .from('analysis_feed')
        .select('id, result_id, run_id, prompt_id, engine, status, fetched_at, judge, brand_mentioned, mention_count, mention_rank, named_count, stance_label, stance_score, recommendation, payload')
        .eq('brand_id', brandId)
        .order('fetched_at', { ascending: false })
        .limit(3000)
      if (error) throw error
      return (data ?? []).map((r) => {
        const p = (r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? r.payload : {}) as Record<string, Json | undefined>
        const nums = (v: Json | undefined): Record<string, number> =>
          v && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === 'number'))
            : {}
        const owners = nums(p.citation_owners)
        return {
          id: r.id!,
          resultId: r.result_id!,
          runId: r.run_id,
          promptId: r.prompt_id!,
          engine: r.engine!,
          status: (r.status ?? 'ok') as ResultStatus,
          fetchedAt: r.fetched_at!,
          judge: (r.judge ?? 'none') as JudgeKind,
          brandMentioned: !!r.brand_mentioned,
          mentionCount: r.mention_count ?? 0,
          mentionRank: r.mention_rank,
          namedCount: r.named_count ?? 0,
          stance: (r.stance_label ?? 'not_mentioned') as StanceLabel,
          stanceScore: Number(r.stance_score ?? 0),
          recommendation: (r.recommendation ?? 'not_mentioned') as Recommendation,
          competitorCounts: nums(p.competitor_counts),
          citationOwners: { brand: owners.brand ?? 0, competitor: owners.competitor ?? 0, third_party: owners.third_party ?? 0 },
        }
      })
    },
    staleTime: 15_000,
  })

/** The newest feed row per prompt × engine (results arrive newest first). */
export function latestFeed(rows: FeedRow[]): FeedRow[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const k = `${r.promptId}:${r.engine}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export interface Headline {
  /** Prompts whose latest answer on at least one engine names the brand, over prompts answered. */
  visibility: { mentioned: number; answered: number }
  /** Brand mentions over brand + known-competitor mentions, latest answers only. */
  shareOfVoice: { brand: number; competitors: number; byCompetitor: Record<string, number> }
  /** Mean stance score over latest answers that name the brand. */
  stance: { mean: number | null; n: number }
  /** Mean 1-based rank where the brand is named. */
  rank: { mean: number | null; n: number }
}

export function headline(latest: FeedRow[]): Headline {
  const byPrompt = new Map<string, FeedRow[]>()
  for (const r of latest) byPrompt.set(r.promptId, [...(byPrompt.get(r.promptId) ?? []), r])
  let mentionedPrompts = 0
  for (const rows of byPrompt.values()) if (rows.some((r) => r.brandMentioned)) mentionedPrompts++
  let brand = 0
  const byCompetitor: Record<string, number> = {}
  let stanceSum = 0
  let stanceN = 0
  let rankSum = 0
  let rankN = 0
  for (const r of latest) {
    brand += r.mentionCount
    for (const [name, n] of Object.entries(r.competitorCounts)) byCompetitor[name] = (byCompetitor[name] ?? 0) + n
    if (r.brandMentioned) {
      // Stance comes from the judge; an unjudged answer has none.
      if (r.judge !== 'none') {
        stanceSum += r.stanceScore
        stanceN++
      }
      if (r.mentionRank) {
        rankSum += r.mentionRank
        rankN++
      }
    }
  }
  const competitors = Object.values(byCompetitor).reduce((a, b) => a + b, 0)
  return {
    visibility: { mentioned: mentionedPrompts, answered: byPrompt.size },
    shareOfVoice: { brand, competitors, byCompetitor },
    stance: { mean: stanceN ? stanceSum / stanceN : null, n: stanceN },
    rank: { mean: rankN ? rankSum / rankN : null, n: rankN },
  }
}

export interface EngineSummary {
  engine: string
  answers: number
  mentioned: number
  meanStance: number | null
  meanRank: number | null
}

export function byEngine(latest: FeedRow[]): EngineSummary[] {
  const m = new Map<string, FeedRow[]>()
  for (const r of latest) m.set(r.engine, [...(m.get(r.engine) ?? []), r])
  return [...m.entries()]
    .map(([engine, rows]) => {
      const named = rows.filter((r) => r.brandMentioned)
      const judged = named.filter((r) => r.judge !== 'none')
      const ranked = named.filter((r) => r.mentionRank)
      return {
        engine,
        answers: rows.length,
        mentioned: named.length,
        meanStance: judged.length ? judged.reduce((s, r) => s + r.stanceScore, 0) / judged.length : null,
        meanRank: ranked.length ? ranked.reduce((s, r) => s + (r.mentionRank ?? 0), 0) / ranked.length : null,
      }
    })
    .sort((a, b) => b.answers - a.answers)
}

export interface TrendPoint {
  /** YYYY-MM-DD, local. */
  day: string
  answers: number
  /** Share of answers naming the brand. */
  visibility: number
  /** Mean stance over answers naming the brand (null when none). */
  stance: number | null
}

/** Daily visibility and stance over every analysed answer. */
export function trend(rows: FeedRow[]): TrendPoint[] {
  const days = new Map<string, FeedRow[]>()
  for (const r of rows) {
    const d = new Date(r.fetchedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.set(key, [...(days.get(key) ?? []), r])
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rs]) => {
      const named = rs.filter((r) => r.brandMentioned)
      const judged = named.filter((r) => r.judge !== 'none')
      return {
        day,
        answers: rs.length,
        visibility: rs.length ? named.length / rs.length : 0,
        stance: judged.length ? judged.reduce((s, r) => s + r.stanceScore, 0) / judged.length : null,
      }
    })
}

// ------------------------------------------------------------- citations

export type CitationOwner = 'brand' | 'competitor' | 'third_party'

export function citationOwner(domain: string, profile: BrandProfile | null): { owner: CitationOwner; ownerName?: string } {
  if (!profile) return { owner: 'third_party' }
  const d = domain.toLowerCase().replace(/^www\./, '')
  const matches = (owned: string[]) =>
    owned.some((o) => {
      const x = o.toLowerCase().replace(/^www\./, '')
      return d === x || d.endsWith('.' + x)
    })
  if (matches(profile.domains)) return { owner: 'brand' }
  for (const c of profile.competitors) if (matches(c.domains)) return { owner: 'competitor', ownerName: c.name }
  return { owner: 'third_party' }
}

export interface DomainRow {
  domain: string
  owner: CitationOwner
  ownerName?: string
  citations: number
  /** Distinct prompts this domain was cited for. */
  prompts: number
  engines: string[]
  /** Mean 1-based position in the engines' source lists. */
  meanPosition: number | null
  sample: { title?: string; url: string }
}

/** Domains cited across the latest answers, most cited first. */
export function domainTable(latest: AnswerResult[], profile: BrandProfile | null): DomainRow[] {
  const m = new Map<string, { rows: DomainRow; prompts: Set<string>; engines: Set<string>; posSum: number; posN: number }>()
  for (const r of latest) {
    if (r.status !== 'ok') continue
    for (const c of r.citations) {
      const domain = c.domain || domainOf(c.url)
      let e = m.get(domain)
      if (!e) {
        e = {
          rows: { domain, ...citationOwner(domain, profile), citations: 0, prompts: 0, engines: [], meanPosition: null, sample: { title: c.title, url: c.url } },
          prompts: new Set(),
          engines: new Set(),
          posSum: 0,
          posN: 0,
        }
        m.set(domain, e)
      }
      e.rows.citations++
      e.prompts.add(r.promptId)
      e.engines.add(r.engine)
      if (c.position > 0) {
        e.posSum += c.position
        e.posN++
      }
    }
  }
  return [...m.values()]
    .map((e) => ({
      ...e.rows,
      prompts: e.prompts.size,
      engines: [...e.engines],
      meanPosition: e.posN ? e.posSum / e.posN : null,
    }))
    .sort((a, b) => b.citations - a.citations || a.domain.localeCompare(b.domain))
}

// ------------------------------------------------------------- schedules

export type ScheduleFrequency = 'weekly' | 'biweekly' | 'monthly'

export interface Schedule {
  brandId: string
  frequency: ScheduleFrequency
  nextRunAt: string
  lastRunAt: string | null
}

export const scheduleQueryOptions = (brandId: string) =>
  queryOptions({
    queryKey: ['schedule', brandId],
    queryFn: async (): Promise<Schedule | null> => {
      const { data, error } = await supabase
        .from('schedules')
        .select('brand_id, frequency, next_run_at, last_run_at')
        .eq('brand_id', brandId)
        .maybeSingle()
      if (error) throw error
      return data
        ? { brandId: data.brand_id, frequency: data.frequency as ScheduleFrequency, nextRunAt: data.next_run_at, lastRunAt: data.last_run_at }
        : null
    },
    staleTime: 60_000,
  })

const FREQUENCY_DAYS: Record<ScheduleFrequency, number> = { weekly: 7, biweekly: 14, monthly: 30 }

/** Set, change or clear (null) the brand's schedule. The first run is
 *  one period out; the pg_cron runner advances it after each sweep. */
export async function saveSchedule(
  qc: QueryClient,
  brandId: string,
  frequency: ScheduleFrequency | null,
): Promise<Schedule | null> {
  if (!frequency) {
    const { error } = await supabase.from('schedules').delete().eq('brand_id', brandId)
    if (error) throw error
    qc.setQueryData(scheduleQueryOptions(brandId).queryKey, null)
    return null
  }
  const next = new Date(Date.now() + FREQUENCY_DAYS[frequency] * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('schedules')
    .upsert({ brand_id: brandId, frequency, next_run_at: next }, { onConflict: 'brand_id' })
    .select('brand_id, frequency, next_run_at, last_run_at')
    .single()
  if (error) throw error
  const s = { brandId: data.brand_id, frequency: data.frequency as ScheduleFrequency, nextRunAt: data.next_run_at, lastRunAt: data.last_run_at }
  qc.setQueryData(scheduleQueryOptions(brandId).queryKey, s)
  return s
}

// ---------------------------------------------------------------- export

/** The prompts table as CSV rows (RFC-4180 quoting is in lib/export.ts). */
export function promptsCsv(
  prompts: TrackedPrompt[],
  latest: Map<string, AnswerResult>,
  analyses: Map<string, Analysis> | undefined,
): { header: string[]; rows: string[][] } {
  const header = ['Prompt', 'Tags', 'Engine', 'Last run', 'Status', 'Mentioned', 'Mentions', 'Position', 'Stance', 'Recommendation', 'Summary']
  const rows: string[][] = []
  for (const p of prompts) {
    for (const e of p.engines) {
      const r = latest.get(`${p.id}:${e}`)
      const a = r ? analyses?.get(r.id) : undefined
      rows.push([
        p.promptText,
        p.tags.join('; '),
        engineLabel(e),
        r ? new Date(r.fetchedAt).toISOString() : '',
        r?.status === 'no_answer' ? 'no answer shown' : (r?.status ?? 'not run'),
        a ? (a.brandMentioned ? 'yes' : 'no') : '',
        a ? String(a.mentionCount) : '',
        a?.mentionRank ? String(a.mentionRank) : '',
        a ? STANCE_LABELS[a.stance] : '',
        a ? RECOMMENDATION_LABELS[a.recommendation] : '',
        a?.summary ?? '',
      ])
    }
  }
  return { header, rows }
}

// ------------------------------------------------ discovered competitors

export interface DiscoveredCompetitor {
  name: string
  /** Answers (latest per prompt × engine) that named it. */
  answers: number
  /** How the answers treated it, most common first. */
  stances: Partial<Record<StanceLabel, number>>
  sampleQuote: string | null
}

/** Providers the judge named that are not in the profile's competitor
 *  list, across the brand's latest answers — Settings offers them. */
export const discoveredCompetitorsQueryOptions = (brandId: string, knownNames: string[]) =>
  queryOptions({
    queryKey: ['analyses', 'discovered', brandId, [...knownNames].sort()],
    queryFn: async (): Promise<DiscoveredCompetitor[]> => {
      const { data, error } = await supabase
        .from('analysis_feed')
        .select('prompt_id, engine, fetched_at, payload')
        .eq('brand_id', brandId)
        .eq('judge', 'model')
        .order('fetched_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      const known = new Set(knownNames.map((n) => n.trim().toLowerCase()))
      const seen = new Set<string>()
      const m = new Map<string, DiscoveredCompetitor>()
      for (const row of data ?? []) {
        const k = `${row.prompt_id}:${row.engine}`
        if (seen.has(k)) continue
        seen.add(k)
        const p = (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {}) as Record<string, Json | undefined>
        const j = p.judgment && typeof p.judgment === 'object' && !Array.isArray(p.judgment) ? (p.judgment as unknown as Judgment) : null
        for (const c of j?.competitors ?? []) {
          const key = c.name.trim().toLowerCase()
          if (!key || known.has(key)) continue
          const e = m.get(key) ?? { name: c.name.trim(), answers: 0, stances: {}, sampleQuote: null }
          e.answers++
          e.stances[c.stance] = (e.stances[c.stance] ?? 0) + 1
          if (!e.sampleQuote && c.quote) e.sampleQuote = c.quote
          m.set(key, e)
        }
      }
      return [...m.values()].sort((a, b) => b.answers - a.answers || a.name.localeCompare(b.name))
    },
    staleTime: 30_000,
  })
