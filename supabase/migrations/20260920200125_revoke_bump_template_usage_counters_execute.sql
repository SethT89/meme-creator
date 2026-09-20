-- Follow-up to 20260920195906_template_usage_counters: the trigger function was left
-- callable through the REST API (flagged by the Supabase security advisor). Harmless
-- (a trigger function can't run outside a trigger) but there's no reason to expose it.
-- Trigger firing does not depend on this privilege.
revoke execute on function bump_template_usage_counters() from public, anon, authenticated;
