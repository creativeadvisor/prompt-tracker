import { parseDataForSeo } from './google-dataforseo.ts'
import { parseOpenAi } from './chatgpt.ts'
import { parseGemini } from './gemini.ts'
import { parseClaude } from './claude.ts'
import { ENGINES } from './index.ts'
import { EngineUnavailable } from './types.ts'
import { scenarioFor } from './mock.ts'

// Mapper tests against payloads shaped as each vendor documents them
// (hand-built, not recorded — swap in recorded fixtures once you have keys).

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg)
}

Deno.test('DataForSEO: markdown + references, deduped, domain filled', () => {
  const r = parseDataForSeo({
    tasks: [
      {
        status_code: 20000,
        cost: 0.0012,
        result: [
          {
            items: [
              { type: 'organic' },
              {
                type: 'ai_overview',
                asynchronous_ai_overview: true,
                markdown: '**Northwind Coffee** is a specialist practice.',
                items: [{ type: 'ai_overview_element', text: 'x', references: [{ url: 'https://www.northwindroasters.example/about', title: 'About' }] }],
                references: [
                  { url: 'https://buyersguide.example/x', domain: 'buyersguide.example', title: 'Buyers Guide', text: 'cited' },
                  { url: 'https://www.northwindroasters.example/about', title: 'About (dup)' },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
  assert(r.text === '**Northwind Coffee** is a specialist practice.', 'markdown is the text')
  assert(r.citations.length === 2, `2 unique citations, got ${r.citations.length}`)
  assert(r.citations[1].domain === 'northwindroasters.example', 'domain derived and www stripped')
  assert(r.async, 'async flag read')
})

Deno.test('DataForSEO: no overview', () => {
  const r = parseDataForSeo({ tasks: [{ result: [{ items: [{ type: 'organic' }] }] }] })
  assert(r.text === null && r.citations.length === 0, 'null when absent')
})

Deno.test('OpenAI Responses: output_text + url_citation annotations', () => {
  const r = parseOpenAi({
    output: [
      { type: 'web_search_call' },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: 'Northwind Coffee Roasters is well regarded.',
            annotations: [
              { type: 'url_citation', url: 'https://northwindroasters.example/', title: 'Northwind' },
              { type: 'url_citation', url: 'https://northwindroasters.example/', title: 'Northwind again' },
              { type: 'url_citation', url: 'https://www.reviewsite.example/x', title: 'Review Site' },
            ],
          },
        ],
      },
    ],
    usage: { input_tokens: 120, output_tokens: 80, input_tokens_details: { cached_tokens: 20 } },
  })
  assert(r.text.startsWith('Northwind Coffee'), 'text')
  assert(r.citations.length === 2 && r.citations[1].domain === 'reviewsite.example', 'deduped citations with domains')
  assert(r.usage.input === 100 && r.usage.cacheRead === 20, 'cached tokens split out')
})

Deno.test('Gemini: parts + groundingChunks, redirect uris keep the title host', () => {
  const r = parseGemini({
    candidates: [
      {
        content: { parts: [{ text: 'Northwind Coffee Roasters ' }, { text: 'is a boutique practice.' }] },
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'buyersguide.example' } },
            { web: { uri: 'https://northwindroasters.example/about', title: 'About Northwind' } },
          ],
        },
      },
    ],
    usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 40 },
  })
  assert(r.text === 'Northwind Coffee Roasters is a boutique practice.', 'parts joined')
  assert(r.citations[0].domain === 'buyersguide.example', 'redirect → title host')
  assert(r.citations[1].domain === 'northwindroasters.example', 'plain uri → domain')
})

Deno.test('Claude: text citations first, search results as fallback', () => {
  const withInline = parseClaude([
    { type: 'server_tool_use' },
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://a.example/1', title: 'A' }] },
    { type: 'text', text: 'Northwind Coffee Roasters is ', citations: [{ type: 'web_search_result_location', url: 'https://b.example/2', title: 'B' }] },
    { type: 'text', text: 'well regarded.' },
  ])
  assert(withInline.text === 'Northwind Coffee Roasters is well regarded.', 'text joined')
  assert(withInline.citations.length === 1 && withInline.citations[0].domain === 'b.example', 'inline citations win')
  const fallback = parseClaude([
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://a.example/1', title: 'A' }] },
    { type: 'text', text: 'No inline cites.' },
  ])
  assert(fallback.citations.length === 1 && fallback.citations[0].domain === 'a.example', 'falls back to search results')
})

Deno.test('registry: every real engine is unavailable without its key', async () => {
  const ctx = { env: () => undefined, signal: AbortSignal.timeout(1000) }
  const input = { prompt: 'x', country: 'us', language: 'en', profile: { brandName: 'B', aliases: [], domains: [], competitors: [] } }
  for (const id of ['google_ai_overview', 'chatgpt', 'gemini', 'claude', 'manual'] as const) {
    let threw: unknown = null
    try {
      await ENGINES[id].fetch(input, ctx)
    } catch (e) {
      threw = e
    }
    assert(threw instanceof EngineUnavailable, `${id} should be EngineUnavailable without a key`)
  }
  assert(scenarioFor('best dentist') === scenarioFor('best dentist'), 'mock is deterministic')
})
