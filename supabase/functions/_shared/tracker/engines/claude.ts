import Anthropic from 'npm:@anthropic-ai/sdk@0.109.0'
import { costMillicents, isModelId } from '../../llm.ts'
import { EngineUnavailable, domainOf, type AnswerEngine, type Citation, type EngineAnswer, type Usage } from './types.ts'

// Claude as an answer engine: the Messages API with the server-side web
// search tool (web_search_20260209), the user's market as the search
// location. The answer is the text blocks; the citations are the text
// blocks' web_search_result_location citations, falling back to the
// search result blocks when the model cited nothing inline.
//
// Key: ANTHROPIC_API_KEY. Model: ANTHROPIC_MODEL (default
// claude-sonnet-5-5; claude-haiku-4-5 halves the token price and uses the
// basic web search tool, which is what pre-4.6 models accept). Searches:
// ANTHROPIC_MAX_SEARCHES (default 5) — the search results come back as
// input tokens, so this is the cost lever (Sonnet with 5 searches ran
// about 10¢ an answer when measured). Token cost comes from llm.ts's registry; the
// per-search fee is not in the registry and is left out of the stored cost.

type Block = {
  type: string
  text?: string
  citations?: Array<{ type?: string; url?: string; title?: string; cited_text?: string }> | null
  content?: unknown
}

export function parseClaude(content: Block[]): { text: string; citations: Citation[] } {
  const text = content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim()
  const seen = new Set<string>()
  const citations: Citation[] = []
  const add = (url?: string, title?: string) => {
    if (!url || seen.has(url)) return
    seen.add(url)
    citations.push({ url, title, domain: domainOf(url), position: citations.length + 1 })
  }
  for (const b of content) {
    if (b.type !== 'text') continue
    for (const c of b.citations ?? []) if (c.type === 'web_search_result_location') add(c.url, c.title)
  }
  if (citations.length === 0) {
    for (const b of content) {
      if (b.type !== 'web_search_tool_result' || !Array.isArray(b.content)) continue
      for (const r of b.content as Array<{ type?: string; url?: string; title?: string }>) if (r.type === 'web_search_result') add(r.url, r.title)
    }
  }
  return { text, citations }
}

export const claudeEngine: AnswerEngine = {
  id: 'claude',
  label: 'Claude',
  async fetch(input, ctx): Promise<EngineAnswer> {
    const apiKey = ctx.env('ANTHROPIC_API_KEY')
    if (!apiKey) throw new EngineUnavailable('Claude needs ANTHROPIC_API_KEY')
    const model = ctx.env('ANTHROPIC_MODEL') || 'claude-sonnet-5-5'
    const maxSearches = Math.min(Math.max(parseInt(ctx.env('ANTHROPIC_MAX_SEARCHES') ?? '', 10) || 5, 1), 10)
    // Two tool variants. The dynamic-filtering one (web_search_20260209,
    // Opus 4.6+ / Sonnet 4.6+) runs code execution under the hood to sift
    // results: measured, that was ONE billable search plus four
    // code-execution steps and ~41k input tokens (~10¢). The basic one
    // (web_search_20250305) returns the results straight; Haiku 4.5 and
    // older take only that. Basic is the default (the same prompt on Sonnet
    // cost ~3.8¢ basic vs ~10¢ dynamic, 13k vs 41k input tokens, with the
    // same names in the answer); ANTHROPIC_SEARCH_TOOL=dynamic opts into the
    // filtering variant on a model that supports it.
    const pref = ctx.env('ANTHROPIC_SEARCH_TOOL')
    const basicOnly = /haiku|claude-3|claude-sonnet-4-5|claude-opus-4-5/.test(model)
    const searchTool = pref === 'dynamic' && !basicOnly ? 'web_search_20260209' : 'web_search_20250305'
    const anthropic = new Anthropic({ apiKey, maxRetries: 2 })
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: input.prompt }]
    const usage: Usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
    const raw: unknown[] = []
    let content: Block[] = []
    // The search loop runs server-side; a pause_turn asks us to continue it.
    for (let turn = 0; turn < 4; turn++) {
      const res = await anthropic.messages
        .stream(
          {
            model,
            max_tokens: 4_000,
            tools: [
              {
                type: searchTool,
                name: 'web_search',
                max_uses: maxSearches,
                user_location: { type: 'approximate', country: input.country.toUpperCase() },
              } as never,
            ],
            messages,
          },
          { signal: ctx.signal },
        )
        .finalMessage()
      raw.push(res)
      usage.input += res.usage.input_tokens
      usage.output += res.usage.output_tokens
      usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0
      usage.cacheRead += res.usage.cache_read_input_tokens ?? 0
      if ((res.stop_reason as string) === 'refusal') throw new Error(`${model} declined the request (refusal)`)
      content = [...content, ...(res.content as unknown as Block[])]
      if (res.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: res.content })
    }
    const parsed = parseClaude(content)
    if (!parsed.text) throw new Error('Claude returned no text')
    return {
      text: parsed.text,
      citations: parsed.citations,
      model,
      raw,
      usage,
      costMillicents: isModelId(model) ? costMillicents(model, usage) : 0,
    }
  },
}
