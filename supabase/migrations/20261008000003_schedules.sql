-- Prompt Tracker: schedules, WITH their runner.
--
-- A schedule is one recurring run per brand. pg_cron fires run_due() every
-- hour; it finds brands whose next_run_at has passed and posts a `sweep`
-- request to the Edge Function through pg_net. There is no user JWT on
-- that path, so the function gates `sweep` on the X-Sweep-Secret header
-- and writes only through the sweep_* SECURITY DEFINER RPCs below. Those
-- four RPCs are the whole write surface of the scheduled path; the
-- user-triggered path writes the tables directly under the caller's RLS.
--
-- run_due() reads three values from Supabase Vault (set them once per
-- project, never in a migration; seed.sql sets local ones):
--   prompt_tracker_function_url      the deployed function's URL
--   prompt_tracker_publishable_key   the project's publishable (anon) key
--   prompt_tracker_sweep_secret      a long random string; the same value
--                                    goes in the function secret SWEEP_SECRET

create table schedules (
  brand_id     uuid primary key references brands(id) on delete cascade,
  frequency    text not null constraint schedules_frequency_check check (frequency in ('weekly', 'biweekly', 'monthly')),
  next_run_at  timestamptz not null,
  last_run_at  timestamptz,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table schedules is
  'One recurring run per brand. run_due() (pg_cron, hourly) fires the due ones.';

create index schedules_due_idx on schedules (next_run_at);

create trigger schedules_touch
  before update on schedules
  for each row execute function touch_updated_at();


create or replace function compute_next_run(p_frequency text, p_from timestamptz default now())
returns timestamptz
language sql
immutable
as $$
  select case p_frequency
    when 'weekly' then p_from + interval '7 days'
    when 'biweekly' then p_from + interval '14 days'
    when 'monthly' then p_from + interval '1 month'
    else p_from + interval '7 days'
  end;
$$;
-- Only run_due() (definer) calls this; the app computes its own first next_run_at.
revoke all on function compute_next_run(text, timestamptz) from public, anon, authenticated;

-- A schedule fires at most once an hour however next_run_at is set: a row
-- written with a past (or near) next_run_at is pushed one period out, so a
-- schedule cannot be used as a "run every tick" lever.
create or replace function schedules_clamp_next_run()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.next_run_at < now() + interval '1 hour' then
    new.next_run_at := compute_next_run(new.frequency, now());
  end if;
  return new;
end;
$$;
revoke all on function schedules_clamp_next_run() from public, anon, authenticated;

create trigger schedules_clamp
  before insert or update of next_run_at, frequency on schedules
  for each row execute function schedules_clamp_next_run();

alter table schedules enable row level security;
revoke all on schedules from public, anon, authenticated;
grant select, insert, update, delete on schedules to authenticated;

create policy "schedules owner all" on schedules
  for all to authenticated
  using (owns_brand(brand_id))
  with check (owns_brand(brand_id) and (created_by is null or created_by = (select auth.uid())));

-- ---- the runner ---------------------------------------------------------

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Posts one `sweep` request per due brand; the function runs the brand's
-- active prompts on their engines. Definer, so it can read the vault;
-- EXECUTE revoked from every app role — only cron calls it.
create or replace function run_due()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_secret text;
  v_key    text;
  v_row    record;
  v_count  integer := 0;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'prompt_tracker_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'prompt_tracker_sweep_secret';
  select decrypted_secret into v_key    from vault.decrypted_secrets where name = 'prompt_tracker_publishable_key';
  if v_url is null or v_secret is null or v_key is null then
    raise notice 'run_due: vault secrets missing (prompt_tracker_function_url, prompt_tracker_sweep_secret, prompt_tracker_publishable_key)';
    return 0;
  end if;
  for v_row in
    select s.brand_id, s.frequency
    from schedules s
    where s.next_run_at <= now()
    for update skip locked
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_key,
        'Authorization', 'Bearer ' || v_key,
        'X-Sweep-Secret', v_secret
      ),
      body := jsonb_build_object('action', 'sweep', 'brand_id', v_row.brand_id),
      timeout_milliseconds := 10000
    );
    update schedules
      set last_run_at = now(),
          next_run_at = compute_next_run(v_row.frequency, now())
      where brand_id = v_row.brand_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function run_due() from public, anon, authenticated;

select cron.schedule('prompt-tracker-run-due', '17 * * * *', $$select run_due()$$);
select cron.schedule('prompt-tracker-stale-runs', '*/5 * * * *', $$select sweep_stale_runs()$$);

-- ---- the sweep path's writes ----------------------------------------------
--
-- Each RPC is scoped to one brand and checks the run it touches belongs
-- to that brand, so a bug in the function cannot reach across owners.

create or replace function sweep_start(p_brand_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand    brands%rowtype;
  v_run_id   uuid;
  v_prompts  jsonb;
begin
  select * into v_brand from brands where id = p_brand_id;
  if not found then raise exception 'brand not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'prompt_text', p.prompt_text, 'engines', p.engines)), '[]'::jsonb)
    into v_prompts
    from prompts p
    where p.brand_id = p_brand_id and p.status = 'active';
  insert into runs (brand_id, input, output)
    values (p_brand_id,
            jsonb_build_object('trigger', 'scheduled', 'prompt_ids', (select coalesce(jsonb_agg(e->>'id'), '[]'::jsonb) from jsonb_array_elements(v_prompts) e)),
            jsonb_build_object('units', '[]'::jsonb))
    returning id into v_run_id;
  return jsonb_build_object(
    'run_id', v_run_id,
    'prompts', v_prompts,
    'brand', to_jsonb(v_brand)
  );
end;
$$;

create or replace function sweep_record_result(
  p_run_id uuid, p_prompt_id uuid, p_engine text, p_engine_model text, p_status text, p_error text,
  p_text text, p_citations jsonb, p_raw jsonb, p_cost_millicents integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run runs%rowtype;
  v_id  uuid;
begin
  select * into v_run from runs where id = p_run_id;
  if not found then raise exception 'run not found'; end if;
  insert into results (run_id, prompt_id, brand_id, engine, engine_model, status, error, response_text, citations, raw, cost_millicents)
    values (p_run_id, p_prompt_id, v_run.brand_id, p_engine, p_engine_model, p_status, p_error, p_text, coalesce(p_citations, '[]'::jsonb), p_raw, coalesce(p_cost_millicents, 0))
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function sweep_record_analysis(p_row jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result results%rowtype;
begin
  select * into v_result from results where id = (p_row->>'result_id')::uuid;
  if not found then raise exception 'result not found'; end if;
  delete from analyses
    where result_id = v_result.id
      and rubric_version = p_row->>'rubric_version'
      and judge = p_row->>'judge';
  insert into analyses (
    result_id, brand_id, rubric_version, judge, model,
    brand_mentioned, mention_count, mention_position, mention_paragraph, mention_rank, named_count, structure,
    stance_label, stance_score, recommendation, confidence, summary, payload, usage, cost_millicents
  ) values (
    v_result.id, v_result.brand_id, p_row->>'rubric_version', p_row->>'judge', p_row->>'model',
    coalesce((p_row->>'brand_mentioned')::boolean, false),
    coalesce((p_row->>'mention_count')::integer, 0),
    (p_row->>'mention_position')::integer,
    (p_row->>'mention_paragraph')::integer,
    (p_row->>'mention_rank')::integer,
    coalesce((p_row->>'named_count')::integer, 0),
    p_row->>'structure',
    coalesce(p_row->>'stance_label', 'not_mentioned'),
    coalesce((p_row->>'stance_score')::numeric, 0),
    coalesce(p_row->>'recommendation', 'not_mentioned'),
    p_row->>'confidence',
    p_row->>'summary',
    coalesce(p_row->'payload', '{}'::jsonb),
    p_row->'usage',
    coalesce((p_row->>'cost_millicents')::integer, 0)
  );
end;
$$;

create or replace function sweep_update_run(p_run_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update runs
    set output      = coalesce(p_patch->'output', output),
        status      = coalesce((p_patch->>'status')::run_status, status),
        error       = case when p_patch ? 'error' then p_patch->>'error' else error end,
        cost_cents  = coalesce((p_patch->>'cost_cents')::integer, cost_cents),
        finished_at = coalesce((p_patch->>'finished_at')::timestamptz, finished_at)
    where id = p_run_id;
  if not found then raise exception 'run not found'; end if;
end;
$$;

revoke all on function sweep_start(uuid) from public, anon, authenticated;
revoke all on function sweep_record_result(uuid, uuid, text, text, text, text, text, jsonb, jsonb, integer) from public, anon, authenticated;
revoke all on function sweep_record_analysis(jsonb) from public, anon, authenticated;
revoke all on function sweep_update_run(uuid, jsonb) from public, anon, authenticated;
