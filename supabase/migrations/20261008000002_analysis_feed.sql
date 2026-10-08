-- Prompt Tracker: the dashboards' one read.
--
-- Each analysis joined to the facts of the answer it judged (brand, prompt,
-- engine, run, when), so Overview and Citations need one query instead of
-- a join in the browser. security_invoker: the view runs as the caller, so
-- the RLS on analyses and results applies unchanged.

create view analysis_feed
with (security_invoker = true)
as
select
  a.id,
  a.result_id,
  r.run_id,
  r.prompt_id,
  r.brand_id,
  r.engine,
  r.status,
  r.fetched_at,
  a.rubric_version,
  a.judge,
  a.model,
  a.brand_mentioned,
  a.mention_count,
  a.mention_rank,
  a.named_count,
  a.structure,
  a.stance_label,
  a.stance_score,
  a.recommendation,
  a.confidence,
  a.summary,
  a.payload,
  a.created_at
from analyses a
join results r on r.id = a.result_id;

comment on view analysis_feed is
  'Analyses joined to their answers, for the Overview and Citations pages. Runs as the caller.';

revoke all on analysis_feed from public, anon;
grant select on analysis_feed to authenticated;
