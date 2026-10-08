# Running Prompt Tracker on a different backend

The app ships on Supabase. This document is for the case where you want it on
something else: Firebase, a plain Postgres with your own API, Convex, a Rails
app, whatever you already run. It describes the **contract** the front end and
the analysis pipeline depend on, so a port can be done deliberately, and ends
with a prompt you can hand to a coding agent.

Be honest with yourself about the size of this. Supabase supplies five things
at once and the port has to replace all five. It is a day or two of focused
work with an agent, not an afternoon.

## What the app actually needs

### 1. Auth

- A way to sign up and sign in with email + password, and to sign out.
- A session the front end can read (`sessionQueryOptions` in
  `app/src/lib/auth.ts`) and a change listener so the UI updates on sign-out.
- A bearer token the backend can verify on every request and map to a user id.

### 2. Storage: five tables, owner-scoped

Column lists are in `supabase/migrations/20261008000001_schema.sql`; the shapes
the front end consumes are the `map*` functions in `app/src/lib/tracker.ts`.

| Table | Scope | Notes |
|---|---|---|
| `brands` | `owner_id` = the user | name, aliases[], domains[], competitors (JSON array of `{name, aliases, domains}`), market_country, market_language, default_engines[], judge_model |
| `prompts` | `brand_id` | prompt_text, tags[], engines[], status; unique on (brand_id, prompt_text) |
| `runs` | `brand_id` | status (`running` / `succeeded` / `failed`), input JSON, output JSON (`output.units` is the per-unit progress the app polls), error, cost_cents, created_at, finished_at |
| `results` | `brand_id` | run_id, prompt_id, engine, engine_model, status (`ok` / `failed` / `unavailable` / `no_answer`), error, response_text, citations JSON, raw JSON, cost_millicents, fetched_at; unique on (run_id, prompt_id, engine) |
| `analyses` | `brand_id` | result_id, rubric_version, judge, model, the extract columns, stance_label, stance_score, recommendation, confidence, summary, payload JSON, usage JSON, cost_millicents; unique on (result_id, rubric_version, judge) |
| `schedules` | `brand_id` (primary key) | frequency, next_run_at, last_run_at |

**The access rule is one sentence:** a user can read and write a row only if
they own the brand it belongs to. On Supabase that is the `owns_brand()`
function and one RLS policy per table. Elsewhere it is a `WHERE` clause or a
middleware check on every query. The front end never relies on hiding data
client-side.

Two columns are intentionally not readable by ordinary users: `results.raw`
and `analyses.usage` / `analyses.cost_millicents`. Keep that if you can; the
app never asks for them.

One read the dashboards use a lot: `analysis_feed`, which is `analyses` joined
to `results` (brand, prompt, engine, status, fetched_at next to the judgment).
A view, a query, or a denormalised copy all work.

### 3. One HTTP endpoint with four actions

`supabase/functions/tracker/index.ts` is the whole server. The front end calls
it through `invoke()` in `app/src/lib/tracker.ts`. Bodies and replies:

| Action | Body | Reply | Who |
|---|---|---|---|
| `run` | `{ brand_id, prompt_ids?, engines?, batch_id? }` | `202 { run_id, units, batch_id }` | signed-in user |
| `manual` | `{ brand_id, prompt_id, text, source_label? }` | `200 { run_id, result_id }` | signed-in user |
| `analyze` | `{ brand_id, result_ids[1..25] }` | `200 { analyzed: [{ result_id, judge, error? }] }` | signed-in user |
| `sweep` | `{ brand_id }` + header `X-Sweep-Secret` | `202 { run_id, units, skipped? }` | the scheduler, no user |

Behaviour that matters:

- `run` answers at once with a `runs` row id and does the work afterwards
  (fire-and-continue). The app polls the run row every 1.5 s while
  `status = running` and reads `output.units` for per-unit progress. If your
  runtime cannot continue after responding, run the units synchronously and
  accept a slower response, or hand the work to a queue.
- Units are prompt × engine pairs, run a few at a time (`CONCURRENCY`), at most
  `MAX_UNITS` per invocation. The app chunks larger batches under one
  `batch_id`.
- An engine that throws `EngineUnavailable` (no key) writes a result row with
  status `unavailable`; any other failure writes `failed`; an engine that
  answered with nothing writes `no_answer`. A run is never silently short.
- Every answer with text goes through `analyzeResult()`
  (`_shared/tracker/analysis/analyze.ts`): extract → judge → validate → one
  analyses row. The writer **deletes then inserts** rather than upserting.
- The engine adapters and the whole analysis pipeline are plain TypeScript
  with no Supabase dependency. Keep them; only the `RunWriter` seam (the three
  write functions at the top of `index.ts`) changes.

### 4. Something that calls `sweep` on a schedule

On Supabase, `run_due()` (pg_cron, hourly) finds `schedules` rows whose
`next_run_at` has passed, posts `sweep` to the function via pg_net with the
secret header, and advances `next_run_at` by the frequency. Any cron that can
make an HTTP request does the same job. The `sweep_*` RPCs exist only so a
user-less request can write without the service role touching tables; with
your own backend you'd write those rows directly in server code.

### 5. Secrets

The engines read their keys from the environment at request time
(`ctx.env(name)` in each adapter). Names are in
`supabase/functions/.env.example`. Any secrets store that ends up in the
server process's environment works.

## What to leave alone

- `supabase/functions/_shared/tracker/engines/*` (the engine adapters)
- `supabase/functions/_shared/tracker/analysis/*` (extract, judge, validate, the rubric prompt, the mock judge)
- `supabase/functions/_shared/llm.ts` (the model registry and the structured call)
- Everything under `app/src/components/` and `app/src/routes/`
- The aggregates in the second half of `app/src/lib/tracker.ts` (`headline`, `byEngine`, `trend`, `domainTable`, …)

What changes: `app/src/lib/supabase.ts`, `app/src/lib/auth.ts`, the query and
write functions in the first half of `app/src/lib/tracker.ts`, and the top
third of `supabase/functions/tracker/index.ts` (identity, the writers, the
`sweep` entry).

## A prompt for your coding agent

Copy, fill in the angle brackets, paste.

```
I have cloned the Prompt Tracker repository (a React + TypeScript app with a
Supabase backend: Postgres with RLS, one Edge Function, pg_cron for schedules).
I want to run it on <YOUR BACKEND> instead of Supabase.

Read docs/other-backends.md first. It lists the five things the app needs
(auth, five owner-scoped tables plus the analysis_feed read, one HTTP endpoint
with the actions run/manual/analyze/sweep, a scheduler that calls sweep, and
environment secrets), says exactly which files change and which must be left
alone, and documents the request/response shapes.

Then:

1. Replace app/src/lib/supabase.ts and app/src/lib/auth.ts with a client for
   <YOUR BACKEND> that provides sign-up, sign-in, sign-out, a session query and
   a change listener with the same exported names.
2. Rewrite the query and write functions in the first half of
   app/src/lib/tracker.ts against <YOUR BACKEND>, keeping every exported name,
   type and return shape unchanged so the routes and components compile
   untouched. Keep the aggregates in the second half as they are.
3. Port supabase/functions/tracker/index.ts to <YOUR RUNTIME>: keep the four
   actions, the unit loop, the RunWriter seam and the EngineUnavailable /
   failed / no_answer semantics; replace identity verification and the three
   writer implementations. Import the engine adapters and the analysis
   pipeline from supabase/functions/_shared/tracker unchanged.
4. Create the schema on <YOUR BACKEND> from supabase/migrations/
   20261008000001_schema.sql, with an equivalent of the ownership rule on
   every table, and an analysis_feed read.
5. Set up a scheduled job that calls the sweep action for every schedules row
   whose next_run_at has passed and advances next_run_at by its frequency.
6. Make the engine and judge keys available to the server process as
   environment variables with the names in supabase/functions/.env.example.
7. Run: cd app && npm run lint && npm run typecheck && npm run build, and
   deno test supabase/functions/_shared/tracker/ (the engine and analysis
   tests must still pass unchanged). Then walk through sign-up → create a
   brand → add a prompt on the mock engine → run → open the prompt → Overview
   and Citations, and confirm each step works end to end.

Do not change anything under app/src/components, app/src/routes,
supabase/functions/_shared/tracker or supabase/functions/_shared/llm.ts.
Never put a key in a file that is committed.
```
