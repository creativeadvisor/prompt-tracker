import { EngineUnavailable, domainOf, type AnswerEngine, type Citation, type EngineAnswer, type Usage } from './types.ts'

// Gemini through the Gemini API with Google Search grounding. The answer
// is the candidate's text parts; the citations are groundingMetadata's
// groundingChunks (web uri + title). Grounded answers come with
// redirect URLs (vertexaisearch.cloud.google.com/grounding-api-redirect/…)
// whose real domain is only known after following them; the title is
// kept and the domain is derived from the title's host when the uri is a
// redirect.
//
// Key: GEMINI_API_KEY. Model: GEMINI_MODEL (default gemini-3.8-flash).
// Grounded search needs billing enabled on the Google project. A typical
// answer: ~35s, a few hundred input and ~1k output tokens plus thinking
// tokens, and around 9 grounded citations (all redirect URLs, so the
// domain comes from the chunk title). Cost is stored as 0 because there is
// no Gemini price row in llm.ts's registry; usage is stored, so add a row
// and a cost line if you want it priced.

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string; domain?: string } }>
      webSearchQueries?: string[]
    }
  }>
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number }
  error?: { message?: string }
}

const REDIRECT = /vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/

export function parseGemini(data: GeminiResponse): { text: string; citations: Citation[]; usage: Usage } {
  const cand = data.candidates?.[0]
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  const seen = new Set<string>()
  const citations: Citation[] = []
  for (const ch of cand?.groundingMetadata?.groundingChunks ?? []) {
    const uri = ch.web?.uri
    if (!uri || seen.has(uri)) continue
    seen.add(uri)
    const title = ch.web?.title
    // Grounding titles are usually the source host ("example.org").
    const domain = ch.web?.domain ?? (REDIRECT.test(uri) && title && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title) ? title.toLowerCase() : domainOf(uri))
    citations.push({ url: uri, title, domain, position: citations.length + 1 })
  }
  const cached = data.usageMetadata?.cachedContentTokenCount ?? 0
  const usage: Usage = {
    input: Math.max(0, (data.usageMetadata?.promptTokenCount ?? 0) - cached),
    // Thinking tokens are billed as output; Gemini reports them apart.
    output: (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0),
    cacheWrite: 0,
    cacheRead: cached,
  }
  return { text, citations, usage }
}

export const geminiEngine: AnswerEngine = {
  id: 'gemini',
  label: 'Gemini',
  async fetch(input, ctx): Promise<EngineAnswer> {
    const apiKey = ctx.env('GEMINI_API_KEY')
    if (!apiKey) throw new EngineUnavailable('Gemini needs GEMINI_API_KEY')
    const model = ctx.env('GEMINI_MODEL') || 'gemini-3.8-flash'
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        tools: [{ google_search: {} }],
      }),
      signal: ctx.signal,
    })
    if (!res.ok) throw new Error(`Gemini failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 300)}`)
    const data = (await res.json()) as GeminiResponse
    if (data.error?.message) throw new Error(`Gemini: ${data.error.message}`)
    const parsed = parseGemini(data)
    if (!parsed.text) throw new Error('Gemini returned no text')
    return { text: parsed.text, citations: parsed.citations, model, raw: data, usage: parsed.usage, costMillicents: 0 }
  },
}
