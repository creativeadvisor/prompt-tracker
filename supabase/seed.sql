-- ============================================================
-- Local development seed (runs on `supabase db reset` only; never
-- applied to a hosted project).
--
-- No sample brand or account: sign up on the sign-in page, create a
-- brand from the empty state, add prompts, and Run. The `mock` engine
-- and the mock judge need no keys, so every screen works at once.
--
-- The three Vault rows below are what run_due() needs to fire scheduled
-- runs against the LOCAL function. They are local-only values (the
-- Supabase CLI's default publishable key and a throwaway secret). On a
-- hosted project you set the same three names once in the dashboard:
-- Project Settings → Vault.
-- ============================================================

select vault.create_secret(
  'http://host.docker.internal:54321/functions/v1/tracker',
  'prompt_tracker_function_url',
  'Prompt Tracker Edge Function (local stack)'
);
select vault.create_secret(
  'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
  'prompt_tracker_publishable_key',
  'Local publishable key (the CLI default)'
);
select vault.create_secret(
  'local-dev-sweep-secret-not-for-production-0000',
  'prompt_tracker_sweep_secret',
  'Local sweep secret — must equal SWEEP_SECRET in supabase/functions/.env'
);
