import { costMillicents, isModelId } from '../../llm.ts'
import { EngineUnavailable, domainOf, type AnswerEngine, type Citation, type EngineAnswer, type Usage } from './types.ts'

// ChatGPT through the OpenAI Responses API with the web_search tool (raw
// fetch, no SDK). The brand's market sets the
// search location. The answer is the message's output_text; its
// url_citation annotations are the citations.
//
// Key: OPENAI_API_KEY. Model: OPENAI_MODEL (default gpt-5.2; add a row to
// MODEL_REGISTRY in _shared/llm.ts for any other model). Cost is the token
// cost from that registry row (the dated model id the API returns is mapped
// to its base id); the per-call web search fee is not in the registry and
// is left out. Expect roughly 10k input tokens per answer, since the search
// results count as input.

interface OaiAnnotation {
  type?: string
  url?: string
  title?: string
  start_index?: number
  end_index?: number
}

interface OaiResponse {
  status?: string
  model?: string
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; annotations?: OaiAnnotation[] }> }>
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } }
  error?: { message?: string }
}

export function parseOpenAi(data: OaiResponse): { text: string; citations: Citation[]; usage: Usage } {
  const parts = (data.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text')
  const text = parts.map((c) => c.text ?? '').join('\n').trim()
  const seen = new Set<string>()
  const citations: Citation[] = []
  for (const c of parts) {
    for (const a of c.annotations ?? []) {
      if (a.type !== 'url_citation' || !a.url || seen.has(a.url)) continue
      seen.add(a.url)
      citations.push({ url: a.url, title: a.title, domain: domainOf(a.url), position: citations.length + 1 })
    }
  }
  const cached = data.usage?.input_tokens_details?.cached_tokens ?? 0
  const usage: Usage = {
    input: Math.max(0, (data.usage?.input_tokens ?? 0) - cached),
    output: data.usage?.output_tokens ?? 0,
    cacheWrite: 0,
    cacheRead: cached,
  }
  return { text, citations, usage }
}

export const chatgptEngine: AnswerEngine = {
  id: 'chatgpt',
  label: 'ChatGPT',
  async fetch(input, ctx): Promise<EngineAnswer> {
    const apiKey = ctx.env('OPENAI_API_KEY')
    if (!apiKey) throw new EngineUnavailable('ChatGPT needs OPENAI_API_KEY')
    const model = ctx.env('OPENAI_MODEL') || 'gpt-5.2'
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: input.prompt,
        tools: [{ type: 'web_search', user_location: { type: 'approximate', country: input.country.toUpperCase() } }],
        store: false,
      }),
      signal: ctx.signal,
    })
    if (!res.ok) throw new Error(`OpenAI responses failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`)
    const data = (await res.json()) as OaiResponse
    if (data.error?.message) throw new Error(`OpenAI: ${data.error.message}`)
    const parsed = parseOpenAi(data)
    if (!parsed.text) throw new Error(`OpenAI returned no text (status ${data.status ?? 'unknown'})`)
    const base = (data.model ?? model).replace(/-\d{4}-\d{2}-\d{2}$/, '')
    return {
      text: parsed.text,
      citations: parsed.citations,
      model: data.model ?? model,
      raw: data,
      usage: parsed.usage,
      costMillicents: isModelId(base) ? costMillicents(base, parsed.usage) : 0,
    }
  },
}
