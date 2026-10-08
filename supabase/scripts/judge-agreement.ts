// Judge agreement: runs the judge over
// the labeled fixtures and reports how often stance, recommendation and
// mentioned agree with the labels — the check to run after any change to
// the rubric prompt, the schema or the model.
//
//   ANTHROPIC_API_KEY=… deno run -A supabase/scripts/judge-agreement.ts [model]
//   (OPENAI_API_KEY for an OpenAI model id)
//
// Without a key it scores the mock judge instead (a floor, not a target).
// The key is read from the environment only — never from a file in the repo.

import { JUDGE_FIXTURES, FIXTURE_PROFILE } from '../functions/_shared/tracker/fixtures/judge-fixtures.ts'
import { extract } from '../functions/_shared/tracker/analysis/extract.ts'
import { judgeAnswer, judgeKeyName, resolveJudgeModel } from '../functions/_shared/tracker/analysis/judge.ts'
import { mockJudgment } from '../functions/_shared/tracker/analysis/judge-mock.ts'
import { validateJudgment } from '../functions/_shared/tracker/analysis/validate.ts'
import type { Judgment } from '../functions/_shared/tracker/analysis/schema.ts'

const model = resolveJudgeModel(Deno.args[0])
const apiKey = Deno.env.get(judgeKeyName(model))
const near: Record<string, string[]> = {
  strongly_positive: ['positive'],
  positive: ['strongly_positive', 'mixed'],
  neutral: ['mixed'],
  mixed: ['neutral', 'positive', 'negative'],
  negative: ['strongly_negative', 'mixed'],
  strongly_negative: ['negative'],
  not_mentioned: [],
}

let exact = 0
let close = 0
let rec = 0
let mentioned = 0
let costMillicents = 0
const rows: string[] = []

for (const f of JUDGE_FIXTURES) {
  let j: Judgment
  if (apiKey) {
    const r = await judgeAnswer({ apiKey, model, engine: 'fixture', prompt: f.prompt, text: f.text, profile: FIXTURE_PROFILE })
    j = r.judgment
    costMillicents += r.costMillicents
  } else {
    const x = extract(f.text, [], FIXTURE_PROFILE)
    j = validateJudgment(mockJudgment(f.text, x, FIXTURE_PROFILE), f.text, FIXTURE_PROFILE.competitors.map((c) => c.name)).judgment
  }
  const sOk = j.brand.stance === f.expect.stance
  const sNear = sOk || (near[f.expect.stance] ?? []).includes(j.brand.stance)
  const rOk = j.brand.recommendation === f.expect.recommendation
  const mOk = j.brand.mentioned === f.expect.mentioned
  exact += sOk ? 1 : 0
  close += sNear ? 1 : 0
  rec += rOk ? 1 : 0
  mentioned += mOk ? 1 : 0
  rows.push(
    `${sOk ? '✓' : sNear ? '~' : '✗'} ${f.id.padEnd(34)} stance ${j.brand.stance.padEnd(18)} want ${f.expect.stance.padEnd(18)} rec ${rOk ? '✓' : '✗'} ${j.brand.recommendation.padEnd(26)} mentioned ${mOk ? '✓' : '✗'}`,
  )
}

const n = JUDGE_FIXTURES.length
console.log(`judge: ${apiKey ? model : `mock (no ${judgeKeyName(model)})`} · ${n} fixtures`)
console.log(rows.join('\n'))
console.log(`\nstance exact ${exact}/${n} · stance close ${close}/${n} · recommendation ${rec}/${n} · mentioned ${mentioned}/${n}`)
if (apiKey) console.log(`cost ≈ ${(costMillicents / 1000).toFixed(2)}¢`)
