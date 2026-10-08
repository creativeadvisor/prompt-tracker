// Prompt Tracker's one Edge Function. Four actions:
//
//   run     { brand_id, prompt_ids?, engines?, batch_id? }   → 202 { run_id, units, batch_id }
//   manual  { brand_id, prompt_id, text, source_label? }      → 200 { run_id, result_id }
//   analyze { brand_id, result_ids }                          → 200 { analyzed }
//   sweep   { brand_id }  (X-Sweep-Secret, from pg_cron)      → 202 { run_id, units }
//
// Identity: for run / manual / analyze the caller's JWT is FORWARDED to
// supabase-js, so every read and write runs as `authenticated` under the
// caller's own Row Level Security. The scheduled `sweep` has no user: it is
// gated on X-Sweep-Secret and writes only through the sweep_* SECURITY
// DEFINER RPCs with the service client (the service role never touches a
// table directly). Gateway JWT verification is off for that reason
// (config.toml); the function checks the JWT itself.
//
// Runtime shape: a run is prompt × engine units, CONCURRENCY at a time, at
// most MAX_UNITS per invocation (the app chunks bigger batches under one
// batch_id). The request answers with the run id at once and the work
// continues in EdgeRuntime.waitUntil; the app polls the run row. An engine
// that fails or has no key writes its own result row (status failed /
// unavailable), so a run is never silently short.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import { getEngine } from '../_shared/tracker/engines/index.ts'
import {
  EngineUnavailable,
  isEngineId,
  type BrandProfile,
  type EngineAnswer,
  type EngineId,
} from '../_shared/tracker/engines/types.ts'
import { analyzeResult, RUBRIC_VERSION, type AnalysisWriter } from '../_shared/tracker/analysis/analyze.ts'
import { DEFAULT_JUDGE } from '../_shared/tracker/analysis/judge.ts'
import { MODEL_REGISTRY } from '../_shared/llm.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MAX_UNITS = 12
const CONCURRENCY = 3
/** A pasted answer's ceiling: it is stored and sent to the judge whole. */
const MAX_MANUAL_CHARS = 40_000
/** Spend guard: engine answers fetched + judgments made per OWNER per rolling
 *  24 hours, across all their brands. Every path that spends a key (run,
 *  manual, analyze, sweep) checks it first. Override with DAILY_UNIT_CAP. */
const DEFAULT_DAILY_UNIT_CAP = 300
/** Judge models a brand may choose (brands.judge_model): any registry model
 *  unless JUDGE_MODELS_ALLOWED (comma-separated) narrows it; anything else
 *  falls back to JUDGE_MODEL / the default. */
const DEFAULT_JUDGE_MODELS_ALLOWED = Object.keys(MODEL_REGISTRY)
/** The value seed.sql and .env.example use for the LOCAL stack. A hosted
 *  function refuses it, so copying the local env file to production cannot
 *  leave the sweep path open. */
const LOCAL_SWEEP_SECRET = 'local-dev-sweep-secret-not-for-production-0000'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ENGINE_TIMEOUT_MS: Partial<Record<EngineId, number>> = {
  google_ai_overview: 120_000,
  chatgpt: 75_000,
  gemini: 75_000,
  claude: 75_000,
  mock: 5_000,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

type Db = SupabaseClient
type Unit = { prompt_id: string; prompt_text: string; engine: EngineId }
type UnitOutcome = { prompt_id: string; engine: EngineId; result_id?: string; status: 'ok' | 'failed' | 'unavailable' | 'no_answer'; error?: string }

/** The brands row as the function reads it. */
type BrandRow = Record<string, unknown> & { id: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const brandId = typeof body.brand_id === 'string' ? body.brand_id : ''
  if (!UUID_RE.test(brandId)) return json({ error: 'brand_id (uuid) is required' }, 400)

  if (body.action === 'sweep') {
    const secret = Deno.env.get('SWEEP_SECRET') ?? ''
    const given = req.headers.get('X-Sweep-Secret') ?? ''
    // A hosted project must set its own long secret; the local default and
    // anything short are refused outright.
    const usable = secret.length >= 32 && (isLocalStack() || secret !== LOCAL_SWEEP_SECRET)
    if (!usable || given.length !== secret.length || !timingSafeEqual(given, secret)) return json({ error: 'unauthorized' }, 401)
    return sweepAction(brandId)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  // Gateway verification is off (the sweep path); verify the user here.
  const { data: userRes, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userRes?.user) return json({ error: 'unauthorized' }, 401)
  if (!emailAllowed(userRes.user.email)) return json({ error: 'this account is not allowed to use the engines' }, 403)

  // Resolve the brand under the caller's RLS: someone else's brand simply
  // isn't found.
  const { data: brandRow } = await supabase.from('brands').select('*').eq('id', brandId).maybeSingle()
  if (!brandRow) return json({ error: 'brand not found or not permitted' }, 404)
  const brand = brandRow as BrandRow
  const profile = toProfile(brand)
  const userId = userRes.user.id

  switch (body.action) {
    case 'run':
      return runAction(supabase, brand, userId, profile, body)
    case 'manual':
      return manualAction(supabase, brand, userId, profile, body)
    case 'analyze':
      return analyzeAction(supabase, brand, profile, body)
    default:
      return json({ error: 'unknown action' }, 400)
  }
})

/** The local CLI stack serves functions over plain http (kong); hosted
 *  projects are always https. */
const isLocalStack = () => (Deno.env.get('SUPABASE_URL') ?? '').startsWith('http://')

/** ALLOWED_EMAILS (comma-separated, case-insensitive) restricts who may
 *  spend the engine keys even if sign-up is left open. Unset = everyone
 *  who can sign in. */
function emailAllowed(email: string | undefined): boolean {
  const raw = Deno.env.get('ALLOWED_EMAILS')?.trim()
  if (!raw) return true
  const allowed = new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
  return !!email && allowed.has(email.toLowerCase())
}

/** Units the caller's owner has spent in the last 24 hours (answers fetched
 *  plus real judgments), and whether `want` more would exceed the cap. Under
 *  the user's client RLS limits the count to their own rows; the sweep path
 *  passes the owner's brand ids explicitly. */
async function dailyBudget(db: Db, want: number, brandIds?: string[]): Promise<{ ok: boolean; used: number; cap: number }> {
  const cap = Math.max(1, parseInt(Deno.env.get('DAILY_UNIT_CAP') ?? '', 10) || DEFAULT_DAILY_UNIT_CAP)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  let r = db.from('results').select('id', { count: 'exact', head: true }).gte('fetched_at', since).neq('engine', 'mock')
  let a = db.from('analyses').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('judge', 'model')
  if (brandIds) {
    r = r.in('brand_id', brandIds)
    a = a.in('brand_id', brandIds)
  }
  const [rr, aa] = await Promise.all([r, a])
  const used = (rr.count ?? 0) + (aa.count ?? 0)
  return { ok: used + want <= cap, used, cap }
}

const overBudget = (b: { used: number; cap: number }) =>
  json({ error: `daily spend cap reached (${b.used}/${b.cap} units in the last 24 hours)`, used: b.used, cap: b.cap }, 429)

/** Vendor error bodies can echo fragments of a request; keep anything that
 *  looks like a key out of the stored error text. */
const scrubSecrets = (s: string) => s.replace(/\b(sk-[A-Za-z0-9_-]{6,}|AIza[0-9A-Za-z_-]{10,}|sk-ant-[A-Za-z0-9_-]{6,})\b/g, '[redacted]')

function timingSafeEqual(a: string, b: string): boolean {
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

/** The write seam: the user path writes the tables under RLS; the sweep
 *  path goes through the definer RPCs with the service client. */
interface RunWriter extends AnalysisWriter {
  recordResult(row: {
    run_id: string
    prompt_id: string
    engine: string
    engine_model: string | null
    status: 'ok' | 'failed' | 'unavailable' | 'no_answer'
    error: string | null
    response_text: string | null
    citations: unknown
    raw: unknown
    cost_millicents: number
  }): Promise<{ id: string | null; error: string | null }>
  updateRun(runId: string, patch: Record<string, unknown>): Promise<void>
}

function userWriter(supabase: Db, brandId: string): RunWriter {
  return {
    async recordResult(row) {
      const { data, error } = await supabase
        .from('results')
        .insert({ ...row, brand_id: brandId })
        .select('id')
        .single()
      return { id: data?.id ?? null, error: error?.message ?? null }
    },
    async updateRun(runId, patch) {
      await supabase.from('runs').update(patch).eq('id', runId)
    },
    async recordAnalysis(row) {
      const { error: delErr } = await supabase
        .from('analyses')
        .delete()
        .eq('result_id', row.result_id as string)
        .eq('rubric_version', row.rubric_version as string)
        .eq('judge', row.judge as string)
      if (delErr) return delErr.message
      const { error } = await supabase.from('analyses').insert(row)
      return error?.message ?? null
    },
  }
}

function sweepWriter(service: Db): RunWriter {
  return {
    async recordResult(row) {
      const { data, error } = await service.rpc('sweep_record_result', {
        p_run_id: row.run_id,
        p_prompt_id: row.prompt_id,
        p_engine: row.engine,
        p_engine_model: row.engine_model,
        p_status: row.status,
        p_error: row.error,
        p_text: row.response_text,
        p_citations: row.citations,
        p_raw: row.raw,
        p_cost_millicents: row.cost_millicents,
      })
      return { id: (data as string | null) ?? null, error: error?.message ?? null }
    },
    async updateRun(runId, patch) {
      await service.rpc('sweep_update_run', { p_run_id: runId, p_patch: patch })
    },
    async recordAnalysis(row) {
      const { error } = await service.rpc('sweep_record_analysis', { p_row: row })
      return error?.message ?? null
    },
  }
}

function toProfile(row: Record<string, unknown>): BrandProfile {
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])
  const comps = Array.isArray(row.competitors) ? row.competitors : []
  return {
    brandName: String(row.name ?? ''),
    aliases: strs(row.aliases),
    domains: strs(row.domains),
    competitors: comps
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({ name: String(c.name ?? ''), aliases: strs(c.aliases), domains: strs(c.domains) }))
      .filter((c) => c.name),
  }
}

/** Sentiment analysis runs only when the brand has it on AND the
 *  deployment has not switched it off (JUDGE_ENABLED=false). */
const judgeOn = (brand: Record<string, unknown>) =>
  brand.judge_enabled !== false && (Deno.env.get('JUDGE_ENABLED') ?? 'true').toLowerCase() !== 'false'

function judgeModelOf(brand: Record<string, unknown>): string {
  const fallback = Deno.env.get('JUDGE_MODEL') || DEFAULT_JUDGE
  const allowed = (Deno.env.get('JUDGE_MODELS_ALLOWED') ?? DEFAULT_JUDGE_MODELS_ALLOWED.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const chosen = typeof brand.judge_model === 'string' ? brand.judge_model : ''
  return chosen && allowed.includes(chosen) ? chosen : fallback
}

// ------------------------------------------------------------------ run

async function runAction(
  supabase: Db,
  brand: BrandRow,
  userId: string | null,
  profile: BrandProfile,
  body: Record<string, unknown>,
) {
  const wantIds = Array.isArray(body.prompt_ids) ? body.prompt_ids.filter((s): s is string => typeof s === 'string' && UUID_RE.test(s)).slice(0, 200) : null
  const wantEngines = Array.isArray(body.engines) ? body.engines.filter(isEngineId) : null
  const batchId = typeof body.batch_id === 'string' && UUID_RE.test(body.batch_id) ? body.batch_id : crypto.randomUUID()

  let q = supabase.from('prompts').select('id, prompt_text, engines').eq('brand_id', brand.id).eq('status', 'active')
  if (wantIds) q = q.in('id', wantIds)
  const { data: prompts, error: pErr } = await q
  if (pErr) return json({ error: pErr.message }, 500)

  const units: Unit[] = []
  for (const p of prompts ?? []) {
    const engines = (wantEngines ?? (p.engines as string[])).filter(isEngineId).filter((e) => e !== 'manual')
    for (const engine of engines) units.push({ prompt_id: p.id, prompt_text: p.prompt_text, engine })
  }
  if (units.length === 0) return json({ error: 'nothing to run (no active prompts, or only manual engines)' }, 400)
  if (units.length > MAX_UNITS) return json({ error: `too many units (${units.length} > ${MAX_UNITS}); chunk the request`, max_units: MAX_UNITS }, 413)
  // Each real unit is one engine call, plus one judgment when the judge is on.
  const paid = units.filter((u) => u.engine !== 'mock').length
  if (paid > 0) {
    const budget = await dailyBudget(supabase, paid * (judgeOn(brand) ? 2 : 1))
    if (!budget.ok) return overBudget(budget)
  }

  const { data: run, error: rErr } = await supabase
    .from('runs')
    .insert({
      brand_id: brand.id,
      rubric_version: RUBRIC_VERSION,
      input: {
        trigger: 'manual',
        batch_id: batchId,
        prompt_ids: [...new Set(units.map((u) => u.prompt_id))],
        engines: [...new Set(units.map((u) => u.engine))],
        unit_count: units.length,
      },
      output: { units: [] },
      created_by: userId,
    })
    .select('id')
    .single()
  if (rErr || !run) return json({ error: rErr?.message ?? 'run insert failed' }, 500)

  const writer = userWriter(supabase, brand.id)
  EdgeRuntime.waitUntil(
    runUnits(writer, run.id, units, profile, brand).catch(async (e) => {
      await writer.updateRun(run.id, { status: 'failed', error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString() })
    }),
  )

  return json({ run_id: run.id, units: units.length, batch_id: batchId }, 202)
}

async function runUnits(
  writer: RunWriter,
  runId: string,
  units: Unit[],
  profile: BrandProfile,
  brand: BrandRow,
) {
  const outcomes: UnitOutcome[] = []
  let costMillicents = 0
  const country = String(brand.market_country ?? 'us')
  const language = String(brand.market_language ?? 'en')

  const patch = () => writer.updateRun(runId, { output: { units: outcomes } })

  async function one(u: Unit) {
    const engine = getEngine(u.engine)
    let answer: EngineAnswer | null = null
    let status: UnitOutcome['status'] = 'ok'
    let error: string | undefined
    try {
      answer = await engine.fetch(
        { prompt: u.prompt_text, country, language, profile },
        { env: (k) => Deno.env.get(k), signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS[u.engine] ?? 60_000) },
      )
    } catch (e) {
      status = e instanceof EngineUnavailable ? 'unavailable' : 'failed'
      error = scrubSecrets(e instanceof Error ? e.message : String(e)).slice(0, 400)
    }
    if (answer?.empty) status = 'no_answer'
    const rec = await writer.recordResult({
      run_id: runId,
      prompt_id: u.prompt_id,
      engine: u.engine,
      engine_model: answer?.model ?? null,
      status,
      error: error ?? null,
      response_text: answer && !answer.empty ? answer.text : null,
      citations: answer?.citations ?? [],
      raw: answer?.raw ?? null,
      cost_millicents: answer?.costMillicents ?? 0,
    })
    const row = rec.id ? { id: rec.id } : null
    if (!row) {
      outcomes.push({ prompt_id: u.prompt_id, engine: u.engine, status: 'failed', error: rec.error ?? 'insert failed' })
      await patch()
      return
    }
    costMillicents += answer?.costMillicents ?? 0
    if (answer && !answer.empty) {
      const a = await analyzeResult(writer, {
        resultId: row.id,
        brandId: brand.id,
        engine: u.engine,
        prompt: u.prompt_text,
        text: answer.text,
        citations: answer.citations,
        profile,
        judge: judgeOn(brand),
        judgeModel: judgeModelOf(brand),
        env: (k) => Deno.env.get(k),
      })
      costMillicents += a.costMillicents
      if (a.error) console.error(`[tracker] analysis failed for result ${row.id}: ${a.error}`)
    }
    outcomes.push({ prompt_id: u.prompt_id, engine: u.engine, result_id: row.id, status, error })
    await patch()
  }

  // A small worker pool: CONCURRENCY units in flight.
  const queue = [...units]
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) await one(queue.shift()!)
    }),
  )

  const okCount = outcomes.filter((o) => o.status === 'ok').length
  const answered = outcomes.filter((o) => o.status === 'ok' || o.status === 'no_answer').length
  await writer.updateRun(runId, {
    status: answered > 0 ? 'succeeded' : 'failed',
    error: answered > 0 ? null : 'no engine answered',
    output: { units: outcomes, ok: okCount, total: units.length },
    cost_cents: Math.ceil(costMillicents / 1000),
    finished_at: new Date().toISOString(),
  })
}

// ---------------------------------------------------------------- sweep

/** A scheduled run (pg_cron → pg_net): no user, so the service client
 *  calls the sweep_* definer RPCs and nothing else. */
async function sweepAction(brandId: string) {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceKey) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, 500)
  const service = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await service.rpc('sweep_start', { p_brand_id: brandId })
  if (error || !data) return json({ error: error?.message ?? 'sweep start failed' }, 500)
  const start = data as { run_id: string; prompts: Array<{ id: string; prompt_text: string; engines: string[] }>; brand: BrandRow & { owner_id?: string } }
  const profile = toProfile(start.brand)
  const units: Unit[] = []
  for (const p of start.prompts ?? []) {
    for (const engine of (p.engines ?? []).filter(isEngineId).filter((e) => e !== 'manual')) units.push({ prompt_id: p.id, prompt_text: p.prompt_text, engine })
  }
  const writer = sweepWriter(service)
  if (units.length === 0) {
    await writer.updateRun(start.run_id, { status: 'failed', error: 'nothing to run', finished_at: new Date().toISOString() })
    return json({ run_id: start.run_id, units: 0 }, 202)
  }
  // The owner's whole daily budget, not just this brand's.
  const { data: owned } = await service.from('brands').select('id').eq('owner_id', String(start.brand.owner_id ?? ''))
  const paid = Math.min(units.length, MAX_UNITS)
  const budget = await dailyBudget(service, paid * (judgeOn(start.brand) ? 2 : 1), (owned ?? []).map((b) => b.id as string))
  if (!budget.ok) {
    await writer.updateRun(start.run_id, { status: 'failed', error: `daily spend cap reached (${budget.used}/${budget.cap})`, finished_at: new Date().toISOString() })
    return overBudget(budget)
  }
  // One invocation per sweep; a brand with more than MAX_UNITS units runs
  // the first MAX_UNITS and reports the rest as skipped.
  const batch = units.slice(0, MAX_UNITS)
  EdgeRuntime.waitUntil(
    runUnits(writer, start.run_id, batch, profile, start.brand).catch(async (e) => {
      await writer.updateRun(start.run_id, { status: 'failed', error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString() })
    }),
  )
  return json({ run_id: start.run_id, units: batch.length, skipped: units.length - batch.length }, 202)
}

// --------------------------------------------------------------- manual

async function manualAction(
  supabase: Db,
  brand: BrandRow,
  userId: string | null,
  profile: BrandProfile,
  body: Record<string, unknown>,
) {
  const promptId = typeof body.prompt_id === 'string' ? body.prompt_id : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const sourceLabel = typeof body.source_label === 'string' ? body.source_label.trim().slice(0, 60) : ''
  if (!promptId || text.length < 20) return json({ error: 'prompt_id and at least 20 characters of text are required' }, 400)
  if (text.length > MAX_MANUAL_CHARS) return json({ error: `text is too long (max ${MAX_MANUAL_CHARS} characters)` }, 413)
  const budget = await dailyBudget(supabase, 1)
  if (!budget.ok) return overBudget(budget)
  const { data: prompt } = await supabase.from('prompts').select('id, prompt_text').eq('id', promptId).eq('brand_id', brand.id).maybeSingle()
  if (!prompt) return json({ error: 'prompt not found' }, 404)

  const { data: run, error: rErr } = await supabase
    .from('runs')
    .insert({
      brand_id: brand.id,
      rubric_version: RUBRIC_VERSION,
      input: { trigger: 'paste', prompt_ids: [promptId], engines: ['manual'], unit_count: 1, source_label: sourceLabel || null },
      created_by: userId,
    })
    .select('id')
    .single()
  if (rErr || !run) return json({ error: rErr?.message ?? 'run insert failed' }, 500)

  const { data: row, error: insErr } = await supabase
    .from('results')
    .insert({
      run_id: run.id,
      prompt_id: promptId,
      brand_id: brand.id,
      engine: 'manual',
      engine_model: sourceLabel || null,
      status: 'ok',
      response_text: text,
      citations: [],
      raw: { source_label: sourceLabel || null },
    })
    .select('id')
    .single()
  if (insErr || !row) {
    await supabase.from('runs').update({ status: 'failed', error: insErr?.message ?? 'insert failed', finished_at: new Date().toISOString() }).eq('id', run.id)
    return json({ error: insErr?.message ?? 'insert failed' }, 500)
  }

  const a = await analyzeResult(userWriter(supabase, brand.id), {
    resultId: row.id,
    brandId: brand.id,
    engine: sourceLabel || 'manual',
    prompt: prompt.prompt_text ?? '',
    text,
    citations: [],
    profile,
    judge: judgeOn(brand),
    judgeModel: judgeModelOf(brand),
    env: (k) => Deno.env.get(k),
  })
  await supabase
    .from('runs')
    .update({
      status: 'succeeded',
      output: { units: [{ prompt_id: promptId, engine: 'manual', result_id: row.id, status: 'ok' }], ok: 1, total: 1 },
      cost_cents: Math.ceil(a.costMillicents / 1000),
      finished_at: new Date().toISOString(),
    })
    .eq('id', run.id)
  return json({ run_id: run.id, result_id: row.id })
}

// -------------------------------------------------------------- analyze

async function analyzeAction(
  supabase: Db,
  brand: BrandRow,
  profile: BrandProfile,
  body: Record<string, unknown>,
) {
  const resultIds = Array.isArray(body.result_ids) ? body.result_ids.filter((s): s is string => typeof s === 'string' && UUID_RE.test(s)) : []
  if (resultIds.length === 0 || resultIds.length > 25) return json({ error: 'result_ids (1–25) required' }, 400)
  if (!judgeOn(brand)) return json({ error: 'sentiment analysis is off for this brand (Settings)' }, 409)
  const budget = await dailyBudget(supabase, resultIds.length)
  if (!budget.ok) return overBudget(budget)
  const { data: rows, error } = await supabase
    .from('results')
    .select('id, engine, engine_model, response_text, citations, status, prompts(prompt_text)')
    .eq('brand_id', brand.id)
    .in('id', resultIds)
  if (error) return json({ error: error.message }, 500)
  const done: Array<{ result_id: string; judge: string; error?: string }> = []
  for (const r of rows ?? []) {
    if (r.status !== 'ok' || !r.response_text) continue
    const promptText = (r.prompts as unknown as { prompt_text?: string } | null)?.prompt_text ?? ''
    const a = await analyzeResult(userWriter(supabase, brand.id), {
      resultId: r.id,
      brandId: brand.id,
      engine: r.engine === 'manual' ? (r.engine_model ?? 'manual') : r.engine,
      prompt: promptText,
      text: r.response_text,
      citations: Array.isArray(r.citations) ? r.citations : [],
      profile,
      judge: true,
      judgeModel: judgeModelOf(brand),
      env: (k) => Deno.env.get(k),
      force: true,
    })
    done.push({ result_id: r.id, judge: a.judge, ...(a.error ? { error: a.error } : {}) })
  }
  return json({ analyzed: done })
}
