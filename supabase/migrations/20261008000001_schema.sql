-- Prompt Tracker: the core schema.
--
-- Tenancy is deliberately simple: a signed-in user OWNS brands, and every
-- other row hangs off a brand. Row Level Security on every table checks
-- `owns_brand(brand_id)`, so one Supabase project can hold many users'
-- brands without any of them seeing each other. There is no team or
-- workspace layer; see README § Caveats if you need sharing.
--
-- Tables:
--   brands    the thing being tracked (name, aliases, domains, competitors,
--             market, default engines, judge model). One row per brand.
--   prompts   the questions asked of answer engines on the brand's behalf.
--   runs      one row per batch of work (user-triggered or scheduled).
--   results   one answer per run × prompt × engine.
--   analyses  the extract layer's facts and the judge's reading of one
--             answer, stored once per rubric version. Never recomputed.

create extension if not exists pgcrypto;

-- ---- helpers ---------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function touch_updated_at() from public, anon, authenticated;

-- ---- brands ----------------------------------------------------------------

create table brands (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  name             text not null constraint brands_name_check check (char_length(name) between 1 and 120),
  -- other spellings and short forms people use for the brand
  aliases          text[] not null default '{}' constraint brands_aliases_check check (cardinality(aliases) <= 25 and char_length(array_to_string(aliases, ',')) <= 2000),
  -- domains the brand owns (citation ownership)
  domains          text[] not null default '{}' constraint brands_domains_check check (cardinality(domains) <= 25 and char_length(array_to_string(domains, ',')) <= 2000),
  -- [{name, aliases: [], domains: []}]. Bounded: every field here rides
  -- along on every judge call, so size is cost.
  competitors      jsonb not null default '[]' constraint brands_competitors_check check (jsonb_typeof(competitors) = 'array' and jsonb_array_length(competitors) <= 50 and char_length(competitors::text) <= 20000),
  market_country   text not null default 'us' constraint brands_country_check check (market_country ~ '^[a-z]{2}$'),
  market_language  text not null default 'en' constraint brands_language_check check (market_language ~ '^[a-z]{2}$'),
  -- engines a new prompt runs on; `mock` needs no key and works on day one
  default_engines  text[] not null default '{mock}' constraint brands_engines_check check (cardinality(default_engines) <= 10),
  -- Sentiment analysis (the LLM judge) is an extra model call on every
  -- answer, on top of the engine's own charge. Off, the extract layer (text
  -- matching, no model) still gives mentions, position, share of voice and
  -- citations.
  judge_enabled    boolean not null default true,
  -- the sentiment judge (a key in MODEL_REGISTRY, supabase/functions/_shared/llm.ts).
  -- The function also checks it against JUDGE_MODELS_ALLOWED before use.
  judge_model      text not null default 'claude-sonnet-5-5' constraint brands_judge_check check (judge_model in ('claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-5.2', 'gpt-5-mini')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table brands is
  'A tracked brand: what the extract layer and the judge need to know who '
  '"the brand" is in an answer. Owned by one user.';

create index brands_owner_idx on brands (owner_id, name);

create trigger brands_touch
  before update on brands
  for each row execute function touch_updated_at();

-- The one RLS helper. SECURITY DEFINER so it can be used inside policies
-- on tables the caller may not be able to read otherwise.
create or replace function owns_brand(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from brands b
    where b.id = p_brand_id and b.owner_id = auth.uid()
  );
$$;
revoke all on function owns_brand(uuid) from public, anon;
grant execute on function owns_brand(uuid) to authenticated;

alter table brands enable row level security;
revoke all on brands from public, anon, authenticated;
grant select, insert, update, delete on brands to authenticated;

create policy "brands owner all" on brands
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---- prompts ---------------------------------------------------------------

create table prompts (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references brands(id) on delete cascade,
  prompt_text  text not null constraint prompts_text_check check (char_length(prompt_text) between 3 and 500),
  tags         text[] not null default '{}' constraint prompts_tags_check check (cardinality(tags) <= 20 and char_length(array_to_string(tags, ',')) <= 400),
  -- every engine this prompt runs on
  engines      text[] not null default '{}' constraint prompts_engines_check check (cardinality(engines) between 1 and 10),
  status       text not null default 'active' constraint prompts_status_check check (status in ('active', 'paused', 'archived')),
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint prompts_unique_text unique (brand_id, prompt_text)
);

comment on table prompts is
  'The questions tracked for a brand, each run on every engine in `engines`.';

create index prompts_brand_idx on prompts (brand_id, status);

create trigger prompts_touch
  before update on prompts
  for each row execute function touch_updated_at();

alter table prompts enable row level security;
revoke all on prompts from public, anon, authenticated;
grant select, insert, update, delete on prompts to authenticated;

create policy "prompts owner all" on prompts
  for all to authenticated
  using (owns_brand(brand_id))
  with check (owns_brand(brand_id) and (created_by is null or created_by = (select auth.uid())));

-- ---- runs ------------------------------------------------------------------

create type run_status as enum ('running', 'succeeded', 'failed');

create table runs (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands(id) on delete cascade,
  rubric_version text,
  input          jsonb not null default '{}',
  output         jsonb not null default '{}',
  status         run_status not null default 'running',
  error          text,
  cost_cents     integer,
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);

comment on table runs is
  'One batch of prompt × engine work. The app polls this row; `output.units` holds per-unit outcomes.';

create index runs_brand_idx on runs (brand_id, created_at desc);

alter table runs enable row level security;
revoke all on runs from public, anon, authenticated;
grant select, insert, update, delete on runs to authenticated;

create policy "runs owner all" on runs
  for all to authenticated
  using (owns_brand(brand_id))
  with check (owns_brand(brand_id) and (created_by is null or created_by = (select auth.uid())));

-- A run still 'running' after 15 minutes is dead (the function timed out
-- or crashed). Scheduled below with pg_cron once the extension is enabled.
create or replace function sweep_stale_runs()
returns void
language sql
security definer
set search_path = public
as $$
  update runs
  set status = 'failed',
      error = coalesce(error, 'timed out (watchdog)'),
      finished_at = now()
  where status = 'running'
    and created_at < now() - interval '15 minutes';
$$;
revoke execute on function sweep_stale_runs() from public, anon, authenticated;

-- ---- results ---------------------------------------------------------------
--
-- An engine that fails or has no key still writes a row (status failed /
-- unavailable) so a run is never silently short. `no_answer` means the
-- engine was reached but showed nothing for the query (Google rendered no
-- AI Overview): not judged, not an answer in the dashboards. `raw` is the
-- engine's own payload and is kept off the select grant. Costs are in
-- millicents: some engines charge fractions of a cent per request and
-- integer cents would overcount many times over.

create table results (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid references runs(id) on delete set null,
  prompt_id        uuid not null references prompts(id) on delete cascade,
  brand_id         uuid not null references brands(id) on delete cascade,
  engine           text not null,
  engine_model     text,
  status           text not null default 'ok' constraint results_status_check check (status in ('ok', 'failed', 'unavailable', 'no_answer')),
  error            text,
  response_text    text,
  -- [{url, title, domain, position}]
  citations        jsonb not null default '[]' constraint results_citations_check check (jsonb_typeof(citations) = 'array'),
  raw              jsonb,
  cost_millicents  integer not null default 0,
  fetched_at       timestamptz not null default now(),
  constraint results_once_per_run unique (run_id, prompt_id, engine)
);

comment on table results is
  'An answer engine''s reply to one prompt in one run. `raw` is not selectable by app users.';

create index results_prompt_idx on results (prompt_id, fetched_at desc);
create index results_brand_idx on results (brand_id, fetched_at desc);
create index results_run_idx on results (run_id);

alter table results enable row level security;
revoke all on results from public, anon, authenticated;
grant select (id, run_id, prompt_id, brand_id, engine, engine_model, status, error, response_text, citations, cost_millicents, fetched_at)
  on results to authenticated;
-- Insert is table-wide (the function writes raw and cost under the caller's
-- session); update stays off the cost and raw columns.
grant insert, delete on results to authenticated;
grant update (run_id, prompt_id, brand_id, engine, engine_model, status, error, response_text, citations, fetched_at)
  on results to authenticated;

create policy "results owner all" on results
  for all to authenticated
  using (owns_brand(brand_id))
  with check (owns_brand(brand_id));

-- ---- analyses --------------------------------------------------------------
--
-- One judgment per result × rubric version × judge. A rubric or model
-- change is a NEW row, so history keeps the meaning it had when written.
-- The extract layer's facts (mentioned, position, counts) are columns
-- because the dashboards sort and aggregate on them; the judge's reading
-- is in `payload` (aspects, competitors, risks, opportunities, quotes).
-- `stance_score` derives from `stance_label`: +1 strongly_positive ·
-- +0.5 positive · 0 neutral/mixed/not_mentioned · −0.5 negative ·
-- −1 strongly_negative.
--
-- Writers DELETE then INSERT rather than upsert: `ON CONFLICT DO UPDATE`
-- would read the excluded row's `usage` / `cost_millicents`, which are not
-- selectable under RLS, and fail.

create table analyses (
  id                uuid primary key default gen_random_uuid(),
  result_id         uuid not null references results(id) on delete cascade,
  brand_id          uuid not null references brands(id) on delete cascade,
  rubric_version    text not null,
  -- model = a real LLM judgment (the model id is in `model`); mock = the keyless
  -- placeholder; none = the judge did not run.
  judge             text not null constraint analyses_judge_check check (judge in ('model', 'mock', 'none')),
  model             text,
  -- extract layer
  brand_mentioned   boolean not null default false,
  mention_count     integer not null default 0,
  mention_position  integer,           -- character offset of the first mention
  mention_paragraph integer,           -- 0-based paragraph of the first mention
  mention_rank      integer,           -- 1-based among every named entity
  named_count       integer not null default 0,
  structure         text,
  -- judge
  stance_label      text not null default 'not_mentioned' constraint analyses_stance_check check (stance_label in ('strongly_positive', 'positive', 'neutral', 'mixed', 'negative', 'strongly_negative', 'not_mentioned')),
  stance_score      numeric(3,2) not null default 0,
  recommendation    text not null default 'not_mentioned' constraint analyses_rec_check check (recommendation in ('recommended_outright', 'recommended_conditionally', 'listed_among_options', 'mentioned_in_passing', 'discouraged', 'not_mentioned')),
  confidence        text constraint analyses_conf_check check (confidence is null or confidence in ('low', 'medium', 'high')),
  summary           text,
  payload           jsonb not null default '{}' constraint analyses_payload_check check (jsonb_typeof(payload) = 'object'),
  -- what it cost to produce; not selectable by app users
  usage             jsonb,
  cost_millicents   integer not null default 0,
  created_at        timestamptz not null default now(),
  constraint analyses_once unique (result_id, rubric_version, judge)
);

comment on table analyses is
  'The extract layer''s facts and the judge''s reading of one answer, stored once per rubric version.';

create index analyses_result_idx on analyses (result_id, created_at desc);
create index analyses_brand_idx on analyses (brand_id);

alter table analyses enable row level security;
revoke all on analyses from public, anon, authenticated;
grant select (id, result_id, brand_id, rubric_version, judge, model, brand_mentioned, mention_count, mention_position, mention_paragraph, mention_rank, named_count, structure, stance_label, stance_score, recommendation, confidence, summary, payload, created_at)
  on analyses to authenticated;
grant insert, delete on analyses to authenticated;
grant update (result_id, brand_id, rubric_version, judge, model, brand_mentioned, mention_count, mention_position, mention_paragraph, mention_rank, named_count, structure, stance_label, stance_score, recommendation, confidence, summary, payload)
  on analyses to authenticated;

create policy "analyses owner all" on analyses
  for all to authenticated
  using (owns_brand(brand_id))
  with check (owns_brand(brand_id));
