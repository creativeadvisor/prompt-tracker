import type { AnswerEngine, EngineId } from './types.ts'
import { EngineUnavailable } from './types.ts'
import { mockEngine } from './mock.ts'
import { googleDataForSeoEngine } from './google-dataforseo.ts'
import { chatgptEngine } from './chatgpt.ts'
import { geminiEngine } from './gemini.ts'
import { claudeEngine } from './claude.ts'
import { googleSerpApiEngine } from './google-serpapi.ts'

// The registry. Every real
// engine reports EngineUnavailable until its key is set, so a run records
// the fact per unit instead of failing. `manual` is never fetched — the
// `manual` action stores a pasted answer directly.

export const ENGINES: Record<EngineId, AnswerEngine> = {
  mock: mockEngine,
  manual: {
    id: 'manual',
    label: 'Manual paste',
    fetch() {
      return Promise.reject(new EngineUnavailable('manual answers are pasted, not fetched'))
    },
  },
  // DataForSEO by default; GOOGLE_ADAPTER=serpapi selects the alternate.
  // Read through the context at fetch time, never at import (tests and the
  // runtime both own the env).
  google_ai_overview: {
    id: 'google_ai_overview',
    label: 'Google AI Overview',
    fetch(input, ctx) {
      const engine = ctx.env('GOOGLE_ADAPTER') === 'serpapi' ? googleSerpApiEngine : googleDataForSeoEngine
      return engine.fetch(input, ctx)
    },
  },
  chatgpt: chatgptEngine,
  gemini: geminiEngine,
  claude: claudeEngine,
}

export const getEngine = (id: EngineId): AnswerEngine => ENGINES[id]
