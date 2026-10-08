import { EngineUnavailable, domainOf, type AnswerEngine, type Citation, type EngineAnswer } from './types.ts'

// Google AI Overview through SerpAPI, the alternate adapter behind the
// same interface. Two calls when
// Google renders the overview asynchronously: `google` returns a
// page_token, `google_ai_overview` redeems it. text_blocks are flattened
// to markdown; references are the citations.
//
// Key: SERPAPI_KEY. Selected by setting GOOGLE_ADAPTER=serpapi.
// Cost: plan-based ($0.009–$0.025 a search), stored as 1500 millicents
// (the Developer plan) until the plan is known.

interface SerpBlock {
  type?: string
  snippet?: string
  title?: string
  list?: Array<{ title?: string; snippet?: string }>
  text_blocks?: SerpBlock[]
}

interface SerpAio {
  text_blocks?: SerpBlock[]
  references?: Array<{ link?: string; title?: string; source?: string; index?: number }>
  page_token?: string
  error?: string
}

interface SerpResponse {
  ai_overview?: SerpAio
  answer_box?: { answer?: string; snippet?: string }
  error?: string
}

export function flattenBlocks(blocks: SerpBlock[] | undefined, depth = 0): string {
  const out: string[] = []
  for (const b of blocks ?? []) {
    if (b.type === 'heading' && b.snippet) out.push(`**${b.snippet}**`)
    else if (b.type === 'list' && b.list) out.push(b.list.map((li, i) => `${i + 1}. ${li.title ? `**${li.title}:** ` : ''}${li.snippet ?? ''}`).join('\n'))
    else if (b.type === 'expandable' && b.text_blocks) out.push(flattenBlocks(b.text_blocks, depth + 1))
    else if (b.snippet) out.push(b.snippet)
  }
  return out.filter(Boolean).join('\n\n')
}

export function parseSerpApi(data: SerpResponse): { text: string | null; citations: Citation[]; pageToken: string | null } {
  const aio = data.ai_overview
  if (!aio) {
    const ab = data.answer_box?.answer ?? data.answer_box?.snippet
    return { text: ab ?? null, citations: [], pageToken: null }
  }
  if (aio.page_token && !aio.text_blocks) return { text: null, citations: [], pageToken: aio.page_token }
  const text = flattenBlocks(aio.text_blocks)
  const seen = new Set<string>()
  const citations: Citation[] = []
  for (const r of aio.references ?? []) {
    if (!r.link || seen.has(r.link)) continue
    seen.add(r.link)
    citations.push({ url: r.link, title: r.title ?? r.source, domain: domainOf(r.link), position: citations.length + 1 })
  }
  return { text: text || null, citations, pageToken: null }
}

export const googleSerpApiEngine: AnswerEngine = {
  id: 'google_ai_overview',
  label: 'Google AI Overview (SerpAPI)',
  async fetch(input, ctx): Promise<EngineAnswer> {
    const key = ctx.env('SERPAPI_KEY')
    if (!key) throw new EngineUnavailable('Google AI Overview (SerpAPI) needs SERPAPI_KEY')
    const gl = input.country === 'gb' ? 'uk' : input.country
    const first = new URL('https://serpapi.com/search.json')
    first.search = new URLSearchParams({ engine: 'google', q: input.prompt, gl, hl: input.language, api_key: key }).toString()
    let res = await fetch(first, { signal: ctx.signal })
    if (!res.ok) throw new Error(`SerpAPI failed (${res.status})`)
    let data = (await res.json()) as SerpResponse
    if (data.error) throw new Error(`SerpAPI: ${data.error}`)
    let parsed = parseSerpApi(data)
    const raw: unknown[] = [data]
    let calls = 1
    if (parsed.pageToken) {
      const second = new URL('https://serpapi.com/search.json')
      second.search = new URLSearchParams({ engine: 'google_ai_overview', page_token: parsed.pageToken, api_key: key }).toString()
      res = await fetch(second, { signal: ctx.signal })
      if (!res.ok) throw new Error(`SerpAPI (ai overview) failed (${res.status})`)
      data = (await res.json()) as SerpResponse
      raw.push(data)
      calls++
      parsed = parseSerpApi(data)
    }
    return {
      text: parsed.text ?? '',
      empty: !parsed.text,
      citations: parsed.citations,
      model: parsed.text ? 'google-ai-overview' : undefined,
      raw,
      costMillicents: 1500 * calls,
    }
  },
}
