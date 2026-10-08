import { EngineUnavailable, domainOf, type AnswerEngine, type Citation, type EngineAnswer } from './types.ts'

// Google AI Overview through DataForSEO's Google Organic SERP API.
// One POST per prompt;
// `load_async_ai_overview` asks Google to render an overview it has not
// cached (an extra $0.0006, refunded when none exists). The overview's
// `markdown` is the answer; its `references` are the citations, each with
// the cited text — richer than SerpAPI's text_blocks.
//
// Credentials: DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD (Basic auth).
// Cost: the API reports `cost` per task and that is what is stored (a live
// query with the async overview billed $0.004 = 400 millicents when
// measured); the published $0.0006 / $0.0012 figures are the fallback when
// it is absent. Failed attempts are billed too.

export const LOCATION_NAMES: Record<string, string> = {
  au: 'Australia',
  us: 'United States',
  gb: 'United Kingdom',
  ca: 'Canada',
  nz: 'New Zealand',
  sg: 'Singapore',
  ie: 'Ireland',
}

interface DfsReference {
  source?: string
  domain?: string
  url?: string
  title?: string
  text?: string
}

interface DfsAioElement {
  type?: string
  title?: string
  text?: string
  markdown?: string
  references?: DfsReference[] | null
}

interface DfsAioItem {
  type: 'ai_overview'
  asynchronous_ai_overview?: boolean
  markdown?: string | null
  items?: DfsAioElement[] | null
  references?: DfsReference[] | null
}

interface DfsResponse {
  status_code?: number
  status_message?: string
  cost?: number
  tasks?: Array<{
    id?: string
    status_code?: number
    status_message?: string
    cost?: number
    result?: Array<{ items?: Array<{ type?: string } & Partial<Omit<DfsAioItem, 'type'>>> | null }> | null
  }>
}

/** Pull the overview's text and citations out of a DataForSEO task result. */
export function parseDataForSeo(data: DfsResponse): { text: string | null; citations: Citation[]; async: boolean } {
  const task = data.tasks?.[0]
  const items = task?.result?.[0]?.items ?? []
  const aio = (items.find((i) => i.type === 'ai_overview') as DfsAioItem | undefined) ?? null
  if (!aio) return { text: null, citations: [], async: false }
  let text = aio.markdown?.trim() ?? ''
  if (!text && aio.items?.length) {
    text = aio.items
      .map((el) => el.markdown?.trim() || [el.title ? `**${el.title}**` : '', el.text ?? ''].filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n\n')
  }
  const refs: DfsReference[] = [...(aio.references ?? [])]
  for (const el of aio.items ?? []) for (const r of el.references ?? []) refs.push(r)
  const seen = new Set<string>()
  const citations: Citation[] = []
  for (const r of refs) {
    if (!r.url || seen.has(r.url)) continue
    seen.add(r.url)
    citations.push({ url: r.url, title: r.title ?? r.source ?? undefined, domain: (r.domain ?? domainOf(r.url)).replace(/^www\./, ''), position: citations.length + 1 })
  }
  return { text: text || null, citations, async: !!aio.asynchronous_ai_overview }
}

export const googleDataForSeoEngine: AnswerEngine = {
  id: 'google_ai_overview',
  label: 'Google AI Overview',
  async fetch(input, ctx): Promise<EngineAnswer> {
    const login = ctx.env('DATAFORSEO_LOGIN')
    const password = ctx.env('DATAFORSEO_PASSWORD')
    if (!login || !password) throw new EngineUnavailable('Google AI Overview needs DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD')
    const request = (device: 'desktop' | 'mobile') => [
      {
        keyword: input.prompt,
        location_name: LOCATION_NAMES[input.country] ?? 'United States',
        language_code: input.language,
        device,
        os: device === 'mobile' ? 'android' : 'windows',
        load_async_ai_overview: true,
      },
    ]
    const post = async (device: 'desktop' | 'mobile') => {
      const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${login}:${password}`)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request(device)),
        signal: ctx.signal,
      })
      if (!res.ok) return { httpStatus: res.status, data: null as DfsResponse | null, text: (await res.text().catch(() => '')).slice(0, 300) }
      return { httpStatus: res.status, data: (await res.json()) as DfsResponse, text: '' }
    }
    const pause = () => new Promise((r) => setTimeout(r, 2_500))

    // DataForSEO answers transient faults with task status 40101 ("Internal
    // SE Server Error") or 5xx. The sequence (from a query that failed on
    // desktop every time while mobile and other markets worked):
    // desktop → desktop again → mobile. The mobile answer is a real Google
    // AI Overview, labelled so in engine_model.
    const attempts: Array<'desktop' | 'desktop' | 'mobile'> = ['desktop', 'desktop', 'mobile']
    let data: DfsResponse | null = null
    let task: NonNullable<DfsResponse['tasks']>[number] | undefined
    let device: 'desktop' | 'mobile' = 'desktop'
    let lastError = 'DataForSEO: no response'
    for (let i = 0; i < attempts.length; i++) {
      device = attempts[i]
      if (i > 0) await pause()
      const r = await post(device)
      if (!r.data) {
        lastError = `DataForSEO failed (${r.httpStatus}): ${r.text}`
        if (r.httpStatus >= 500) continue
        throw new Error(lastError)
      }
      const t = r.data.tasks?.[0]
      if (t?.status_code && t.status_code !== 20000) {
        if (t.status_code === 40101 || t.status_code >= 50000) {
          // 40101 that survives the retries has been query-specific in
          // practice — DataForSEO's parser, not our request. The task id
          // is for a support ticket.
          lastError =
            `DataForSEO could not fetch this Google result page (their status ${t.status_code}, task ${t.id ?? 'unknown'}, ${device}). ` +
            'It tends to be specific to one query and market; retry later, try another market in Settings, or report the task id to DataForSEO support.'
          continue
        }
        throw new Error(`DataForSEO task ${t.status_code}: ${t.status_message ?? 'error'}`)
      }
      data = r.data
      task = t
      break
    }
    if (!data) throw new Error(lastError)
    const parsed = parseDataForSeo(data)
    const costUsd = task?.cost ?? data.cost ?? (parsed.async ? 0.0012 : 0.0006)
    return {
      text: parsed.text ?? '',
      empty: !parsed.text,
      citations: parsed.citations,
      model: parsed.text ? (device === 'mobile' ? 'google-ai-overview-mobile' : 'google-ai-overview') : undefined,
      raw: data,
      costMillicents: Math.ceil(costUsd * 100_000),
    }
  },
}
