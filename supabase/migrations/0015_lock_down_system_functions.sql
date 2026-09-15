-- Lumo-Ops — SECURITY FIX: service-role-only functions were callable by anyone
--
-- Found 2026-09-16 while building 002. Migration 0005 created three sessionless
-- "system" functions and revoked EXECUTE from PUBLIC, intending service-role
-- only. But Supabase's default privileges grant EXECUTE on new functions in
-- `public` to `anon` and `authenticated` DIRECTLY, and revoking from PUBLIC does
-- not remove a direct grant. Verified against the hosted project: the anon key
-- alone could execute claim_ai_run_system().
--
-- Impact while open, for a caller who knows or guesses a workspace id:
--   write_audit_system    forge unattributed audit rows (Constitution VIII)
--   claim_ai_run_system   exhaust another workspace's daily AI cap
--   finish_ai_run_system  overwrite the status and error of any AI run log
--
-- Standalone: depends only on 0005, so it can be applied before 0008–0011.

revoke all on function public.write_audit_system(uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;

revoke all on function public.claim_ai_run_system(uuid, text, text)
  from public, anon, authenticated;

revoke all on function public.finish_ai_run_system(uuid, public.run_status, integer, integer, numeric, text)
  from public, anon, authenticated;

grant execute on function public.write_audit_system(uuid, text, text, uuid, jsonb) to service_role;
grant execute on function public.claim_ai_run_system(uuid, text, text) to service_role;
grant execute on function public.finish_ai_run_system(uuid, public.run_status, integer, integer, numeric, text)
  to service_role;
