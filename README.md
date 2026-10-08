# Prompt Tracker

Track what AI answer engines say about a brand.

You give it the questions people ask ChatGPT, Google AI Overview, Gemini and
Claude ("best accountant for freelancers in Austin", "is Acme legit"). It asks
each engine, stores the answer, and judges it: is the brand named, where in the
answer, with what stance, against which competitors, citing which sources. Run
it again next week and see what changed.

It is a small, self-hosted app. You run it on your own Supabase project with
your own API keys. Nothing phones home and there is no hosted service behind it.

**Five screens**

| Screen | What it shows |
|---|---|
| Overview | Visibility rate, share of voice, average stance and position; a per-engine table; trends over time |
| Prompts | The questions you track, with the latest result per engine; add one or paste a list; run, schedule, export CSV |
| Prompt detail | Every engine's answer with the brand highlighted, a diff against the previous run, the judge's reading with verbatim quotes, run history |
| Citations | The domains engines cite for your prompts, classed as brand-owned, competitor-owned or third party |
| Settings | The brand profile: aliases, domains, competitors (plus names the judge spotted in answers), market, default engines |

**How it works, in one paragraph.** A React app talks to a Supabase project.
One Edge Function fetches answers from each engine behind a common interface,
stores them, then runs two analysis layers: a deterministic *extract* step
(word-boundary mention detection, citation ownership, structure) and an LLM
*judge* (Claude, structured output, every quote checked against the answer text
and dropped if it is not verbatim). Analyses are stored once per rubric version
and never recomputed on render, so history keeps its meaning. A `mock` engine
and a mock judge let the whole thing run with no keys at all.

---

## Contents

1. [Run it locally in five minutes](#1-run-it-locally-in-five-minutes)
2. [Point it at your own Supabase project](#2-point-it-at-your-own-supabase-project)
3. [Engines and keys](#3-engines-and-keys)
4. [What it costs](#4-what-it-costs)
5. [Caveats](#5-caveats)
6. [Checks](#6-checks)
7. [Layout](#7-layout)
8. [Using a different backend](#8-using-a-different-backend)

---

## 1. Run it locally in five minutes

You need **Node 22**, **Docker** (for the local Supabase stack), the
**Supabase CLI** and **Deno** (for the Edge Function tests).

```bash
git clone https://github.com/<you>/prompt-tracker.git
cd prompt-tracker
supabase start                              # local Postgres, Auth, Edge runtime
cp app/.env.example app/.env.local          # local URL + publishable key (already filled in)
cp supabase/functions/.env.example supabase/functions/.env   # no keys needed yet
cd app && npm ci && npm run gen:types && npm run dev          # http://localhost:5173
```

In a second terminal:

```bash
supabase functions serve --env-file supabase/functions/.env
```

Then in the browser:

1. **Sign up** on the sign-in page (an account on your local stack; email
   confirmation is off locally).
2. **Create a brand** on the empty state. The name is enough to start.
3. **Prompts → Add prompts.** The engine picker defaults to **Mock**, which
   needs no key and answers deterministically.
4. **Run.** Within a few seconds the rows fill in. Open a prompt to see the
   answer, the highlighted mentions, and the (mock) judgment. Overview and
   Citations populate too.

Everything you see at this point is synthetic. Add real keys (section 3),
restart `functions serve`, switch a prompt's engines, run again, and the same
screens show real answers.

`supabase db reset --local` wipes the local database and re-applies the
migrations and seed. `supabase stop` shuts the stack down.

---

## 2. Point it at your own Supabase project

Everything below is done once per project. Commands run from the repo root
unless noted. Where a step needs a secret, type it in your own terminal or the
dashboard; never paste it into a chat, a ticket or a commit.

### 2.1 Create and link the project

1. Create a project at [supabase.com](https://supabase.com) (any plan; the
   free tier works for a small number of prompts).
2. Link the repo to it:

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

### 2.2 Apply the schema

```bash
supabase db push
```

This applies the three migrations in `supabase/migrations/`: the tables, the
`analysis_feed` view, and the schedules with their pg_cron runner. The
migration enables the `pg_cron` and `pg_net` extensions; both are available on
every hosted project.

**Do not run `seed.sql` against a hosted project.** It is for the local stack
only (it holds local-only Vault values). The CLI never runs it on `db push`.

### 2.3 Deploy the Edge Function

```bash
supabase functions deploy tracker
```

`verify_jwt = false` in `supabase/config.toml` is deliberate and the function
verifies identity itself (see [Caveats](#5-caveats)).

### 2.4 Set the function's secrets

Set the keys you have (section 3 explains each) plus the sweep secret:

```bash
supabase secrets set ANTHROPIC_API_KEY=...
supabase secrets set OPENAI_API_KEY=...
supabase secrets set GEMINI_API_KEY=...
supabase secrets set DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=...
supabase secrets set SWEEP_SECRET="$(openssl rand -hex 32)"
```

Keep the value of `SWEEP_SECRET`: step 2.5 needs the same string. The function
refuses a secret shorter than 32 characters and refuses the local default from
`.env.example`, so **don't push your local `.env` to production with
`secrets set --env-file`**; set each value by hand as above.

Two more are strongly recommended on any project other people can reach:

```bash
supabase secrets set ALLOWED_EMAILS=you@example.com,colleague@example.com
supabase secrets set DAILY_UNIT_CAP=300
```

`ALLOWED_EMAILS` means only those accounts can spend your keys even if sign-up
is left open. `DAILY_UNIT_CAP` is the number of engine answers plus judgments
one account may trigger per rolling 24 hours (default 300); past it the
function answers `429` until the window moves on. The app has no other spend
limit, so also set hard budgets on the vendor side (OpenAI, Anthropic, Google
Cloud, DataForSEO balance).

A key you don't set simply leaves that engine `unavailable`; nothing else
breaks.

### 2.5 Set the three Vault rows (for scheduled runs)

Scheduled runs fire from inside the database (pg_cron → pg_net → the function),
so the database needs to know where the function is and how to authenticate.
In the dashboard, **Project Settings → Vault**, add three secrets:

| Name | Value |
|---|---|
| `prompt_tracker_function_url` | `https://<project-ref>.supabase.co/functions/v1/tracker` |
| `prompt_tracker_publishable_key` | the project's publishable (anon) key, from Project Settings → API |
| `prompt_tracker_sweep_secret` | the exact value you gave `SWEEP_SECRET` in 2.4 |

Skip this step if you don't want schedules; everything else works without it.

### 2.6 Configure Auth and lock the door

1. **Authentication → URL Configuration**: set the Site URL to where you'll
   host the app, and add it to the redirect allow-list.
2. Deploy the app (2.7), open it, and **create your own account**.
3. **Authentication → Providers → Email**: switch off *Allow new users to sign
   up*. Anyone who can register can spend your engine keys; `ALLOWED_EMAILS`
   (2.4) is the belt to this brace. To add a colleague later, invite them from
   **Authentication → Users** while sign-up stays off, and add their address
   to `ALLOWED_EMAILS`.
4. Optional: raise the minimum password length (the local config uses 8) and
   enable a captcha under **Authentication → Attack Protection**.

Email confirmation is on by default for hosted projects, so a sign-up gets a
confirmation email; that is fine for your own account.

The app only uses email + password. There is no password reset or invite flow;
add them if your deployment needs them.

### 2.7 Point the app at the project and deploy it

```bash
cp app/.env.example app/.env.local
```

Edit `app/.env.local` with the hosted values from **Project Settings → API**:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Then build and host the `app/dist` folder on any static host (Vercel, Netlify,
Cloudflare Pages, an S3 bucket):

```bash
cd app && npm ci && npm run gen:types && npm run build
```

`gen:types` reads the schema from the **local** stack by default. Against a
linked hosted project run `supabase gen types typescript --linked > app/src/lib/database.types.ts`
instead.

The two `VITE_` values are safe to expose: the publishable key only ever
reaches your data through Row Level Security, and every table checks that the
caller owns the brand.

---

## 3. Engines and keys

Each engine is an adapter behind one interface
(`supabase/functions/_shared/tracker/engines/`). Keys are read from the
function's environment at request time; a missing key makes that engine report
`unavailable` on each answer instead of failing the run.

| Engine | What it calls | Key(s) | Where to get it | Notes |
|---|---|---|---|---|
| **Google AI Overview** | DataForSEO's Google Organic SERP API, asking Google to render the AI Overview | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | [app.dataforseo.com](https://app.dataforseo.com) (pay as you go) | Returns the overview as markdown plus its cited references. Alternate adapter: SerpAPI (`SERPAPI_KEY` + `GOOGLE_ADAPTER=serpapi`). |
| **ChatGPT** | OpenAI Responses API with the `web_search` tool | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | A restricted key with model capabilities only is enough. `OPENAI_MODEL` overrides the default (`gpt-5.2`). |
| **Gemini** | Gemini API with Google Search grounding | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) | **Grounded search needs billing enabled** on the Google project; the free tier has no quota for it. `GEMINI_MODEL` overrides the default. |
| **Claude** | Anthropic Messages API with the server-side web search tool | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_SEARCHES` (default 5) and `ANTHROPIC_SEARCH_TOOL` (`basic`/`dynamic`) tune it. |
| **Manual paste** | nothing | none | | Paste an answer from any engine the tool doesn't call (Perplexity, Google AI Mode, a screenshot you transcribed). Judged like any other. |
| **Mock** | nothing | none | | Deterministic answers written around your brand and competitors. For development; shown as "Mock" everywhere it appears. |

**The judge** (sentiment analysis) is a structured-output call to a model
you pick per brand in Settings: Claude Sonnet, Haiku or Opus on
`ANTHROPIC_API_KEY`, or GPT-5.2 / GPT-5 mini on `OPENAI_API_KEY`. The default
is `claude-sonnet-5-5`; `JUDGE_MODEL` changes the fallback and
`JUDGE_MODELS_ALLOWED` restricts the dropdown. Without the chosen provider's
key, a keyless mock judge produces a labelled placeholder reading so the
screens still work. Each judgment records which model made it.

**It is an extra model call on every answer, and it can be switched off.**
Each brand has a *Sentiment analysis* switch in Settings; `JUDGE_ENABLED=false`
in the function's secrets turns it off for the whole deployment. With the judge
off you still pay each engine for its answers; what you save is the judgment.
Mentions, position, share of voice and citations are still counted (that is
plain text matching, no model call); stance, aspects, risks and competitor
readings show as "Not judged". *Re-judge* on a prompt's
Sentiment tab stays available while the brand's switch is on. Any model you
use must have a price row in `MODEL_REGISTRY`
(`supabase/functions/_shared/llm.ts`) so stored costs stay honest.

Locally, keys go in `supabase/functions/.env` (gitignored; restart
`functions serve` after editing it). Hosted, they go in the function's secrets
(section 2.4). Never anywhere else.

---

## 4. What it costs

Per answer, measured in October 2026 with default settings. Prices change;
treat these as orders of magnitude and check the vendors' current tables.

| Engine | Latency | Cost per answer | Notes |
|---|---|---|---|
| Google AI Overview (DataForSEO) | 20–60 s | ≈ $0.004 | Charged per attempt, including failed ones. The adapter retries desktop → desktop → mobile, so a query Google refuses can cost 3×. When no overview renders at all the result is `no_answer`. |
| ChatGPT (`gpt-5.2`) | ≈ 20 s | ≈ 2¢ in tokens + OpenAI's per-call web search fee | Roughly 10k input tokens per answer: the search results count as input. The search fee is not in the stored cost. |
| Gemini (`gemini-3.8-flash`) | ≈ 35 s | not priced | Usage is stored; the cost column stays 0 until you add a price row. Thinking tokens count as output. |
| Claude (`claude-sonnet-5-5`, basic search) | ≈ 15 s | ≈ 4¢ | The `dynamic` search tool runs code execution to filter results and costs ~2.5× more for the same answer. |
| Judge (`claude-sonnet-5-5`; other models by choice) | — | 0.5–1.6¢ per answer | Every answer with text is judged, including ones that never name the brand (those are often the ones worth reading). Switch it off per brand in Settings, or everywhere with `JUDGE_ENABLED=false`, to pay for engine calls only. |

Rough arithmetic: 20 prompts × 4 engines, once a week, is about 80 answers and
80 judgments a week, or roughly $5–8 a week with every engine on. A schedule
runs at most 12 prompt × engine units per firing (see Caveats).

---

## 5. Caveats

Read these before you rely on it.

- **Whoever can sign in can spend your keys.** The sign-in page lets anyone
  register until you switch sign-up off (2.6), and every signed-in account can
  run prompts and judgments on *your* engine keys. Three guards exist: sign-up
  off, `ALLOWED_EMAILS`, and `DAILY_UNIT_CAP` (default 300 units per account
  per day). Use all three on a public deployment, plus vendor-side budgets.
- **A brand's owner picks its judge model** in Settings, on your key. By
  default every registry model is allowed, including Opus at about twice
  Sonnet's price. On a deployment other people use, set
  `JUDGE_MODELS_ALLOWED` to the models you are happy to pay for; anything
  outside it falls back to `JUDGE_MODEL`.
- **Costs scale with prompts × engines × schedule.** Every run calls every
  selected engine for every selected prompt and judges every answer. Start with
  a few prompts and one engine, look at the stored `cost_millicents` on the
  results and analyses, then widen.
- **One owner per brand.** Tenancy is deliberately simple: a signed-in user owns
  brands, and Row Level Security checks ownership on every table. There is no
  team or sharing layer. If you need one, add a `workspace_members` table and
  change the `owns_brand()` function in the first migration; every policy goes
  through it.
- **The Edge Function sets `verify_jwt = false`.** That is on purpose: scheduled
  runs arrive from pg_cron with no user session, so the gateway cannot verify
  them. The function verifies identity itself instead: every user action
  requires a valid JWT (401 otherwise) and runs under the caller's own RLS, and
  the `sweep` action requires the `X-Sweep-Secret` header and writes only
  through SECURITY DEFINER RPCs scoped to one brand. The service role never
  touches a table directly.
- **Schedules cap at 12 units per firing.** A brand with more than 12 prompt ×
  engine combinations runs the first 12 on each scheduled sweep and reports the
  rest as skipped. Raise `MAX_UNITS` in `supabase/functions/tracker/index.ts`
  if your function's timeout allows, or chain invocations.
- **Judge quotes are verbatim-checked.** Any aspect, competitor, risk flag or
  opportunity whose quote is not a substring of the answer is dropped and
  counted (`payload.dropped`). You will sometimes see fewer findings than the
  model produced. That is the point.
- **Engines change.** The adapters are written against each vendor's documented
  payload shapes as of October 2026, and the mapper tests use hand-built
  payloads. When a vendor changes a response format an engine will start
  reporting `failed`; the raw payload is stored on the result row so you can see
  why.
- **Gemini citations are redirect URLs.** Grounded answers cite
  `vertexaisearch.cloud.google.com/grounding-api-redirect/...` links. The domain
  shown in Citations comes from the chunk's title; the link itself goes through
  Google.
- **DataForSEO's "AI Summary" endpoint is not Google's AI Overview.** It is
  DataForSEO's own model summarising a SERP. The adapter uses the Organic SERP
  endpoint with `load_async_ai_overview`, which is Google's overview.
- **Keys never enter the repo.** `.gitignore` already excludes every `.env`
  file. If a key ever lands in a commit, treat it as leaked: rotate it first,
  then clean the history.
- **The `raw`, `usage` and `cost_millicents` columns are not readable by app
  users** (column-level grants). The app shows costs only in aggregate. Read
  them in the Supabase dashboard or with the service role.
- **No email flows.** Sign-in is email + password only. Password reset,
  magic links and invites are a few lines each with Supabase Auth; they are
  left out so the template stays small.

---

## 6. Checks

```bash
cd app && npm run lint && npm run typecheck && npm run build
cd supabase/functions && deno check tracker/index.ts && deno test _shared/tracker/
deno run -A supabase/scripts/judge-agreement.ts            # the judge vs 12 labelled fixtures
ANTHROPIC_API_KEY=... deno run -A supabase/scripts/judge-agreement.ts   # with the real judge
```

The agreement script reports how often stance, recommendation and "mentioned"
match the labels. Run it after any change to the rubric prompt
(`_shared/tracker/analysis/prompt.ts`), the schema or the model, and add a
fixture whenever the judge gets a real answer wrong.

---

## 7. Layout

```
app/                        Vite + React 19 + TypeScript + Tailwind v4 + TanStack Router/Query
  src/routes/_authed/       Overview (index) · prompts · prompts_.$promptId · citations · settings
  src/components/tracker/   the tool's components (answer card, diff, sentiment panel, trend chart, …)
  src/components/           generic UI (rail, modal, dropdown, table, tabs, …)
  src/lib/tracker.ts        every query, write and aggregate — the one file that talks to the database
  src/lib/brand-scope.ts    which brand is in scope (per browser)
  src/index.css             the design tokens; restyle the app by editing layer C only
supabase/
  migrations/               20261008000001_schema · 000002_analysis_feed · 000003_schedules
  functions/tracker/        the one Edge Function: run · manual · analyze · sweep
  functions/_shared/tracker/engines/    mock · manual · google (DataForSEO, SerpAPI) · chatgpt · gemini · claude
  functions/_shared/tracker/analysis/   extract → judge → validate → analyses row
  functions/_shared/llm.ts  the model registry (prices) and the structured-output call
  scripts/judge-agreement.ts
  seed.sql                  local-only Vault rows for the scheduled-run path
docs/other-backends.md      the backend contract, if you'd rather not use Supabase
```

**Data model.** `brands` (owner, name, aliases, domains, competitors, market,
default engines, judge model) → `prompts` (text, tags, engines, status) →
`runs` (one batch of work) → `results` (one answer per run × prompt × engine)
→ `analyses` (one judgment per result × rubric version). `schedules` holds one
recurring run per brand. `analysis_feed` joins analyses to their answers for
the dashboards.

---

## 8. Using a different backend

The app is built on Supabase because it supplies five things at once: auth,
Postgres with Row Level Security, a function runtime, scheduling (pg_cron +
pg_net) and a secrets store. If you want to run it on something else, the
contract the app needs is written down in
[docs/other-backends.md](docs/other-backends.md), along with a prompt you can
hand to a coding agent to do the port. It is a real rewrite of the data layer
and the scheduler, not a configuration change.

---

## Maintenance

Published as-is. Issues and pull requests are welcome, but there is no
promise on response time: this is a working tool that was tidied up and given
away, not a product with a roadmap.

## Made by

Zak Ali. It started as a reply to a thread arguing that prompt tracking is a commodity, which it is. The point of giving one away is that the tool itself is no longer what you pay for; the people who built it, and the judgment they bring to the table, are.

Follow me on:
- https://www.linkedin.com/in/zak-ali44/
- https://x.com/_zakali
- https://thoughtson.substack.com/

## License

MIT. See [LICENSE](LICENSE).
