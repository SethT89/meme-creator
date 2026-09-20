-- ---------------------------------------------------------------------------
-- Cached template usage counters + per-user event capture
-- Spec: docs/superpowers/specs/2026-09-20-template-usage-counters-design.md
--
-- Backward compatible: old app code (which reads template_usage_events and
-- inserts events without user_id) keeps working after this is applied.
-- ---------------------------------------------------------------------------

-- Who clicked. Same v1 default every other table uses (see init.sql); add
-- `references auth.users(id)` when auth lands. Existing rows take the default.
alter table template_usage_events
  add column user_id uuid not null default '00000000-0000-0000-0000-000000000001';

-- Makes a future per-person "favorites" query a small lookup.
create index template_usage_events_user_template_idx
  on template_usage_events (user_id, template_id);

-- Cached counters, so sorting never has to read the events table.
alter table templates
  add column use_count_total integer not null default 0,
  add column use_count_7d    integer not null default 0,
  add column last_used_at    timestamptz;

comment on column templates.use_count_total is 'All-time clicks. Maintained by trigger on template_usage_events.';
comment on column templates.use_count_7d    is 'Clicks in the last 7 days. Trigger bumps it; hourly pg_cron job recomputes it so old clicks age out.';
comment on column templates.last_used_at    is 'Time of the most recent click. Maintained by trigger.';

-- Keep the counters current on every click. security definer so it can update
-- templates regardless of the caller's RLS; search_path pinned for safety.
create function bump_template_usage_counters() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.templates
     set use_count_total = use_count_total + 1,
         use_count_7d    = use_count_7d + case when new.created_at > now() - interval '7 days' then 1 else 0 end,
         last_used_at    = greatest(coalesce(last_used_at, new.created_at), new.created_at)
   where id = new.template_id;
  return new;
end;
$$;

create trigger template_usage_events_bump_counters
  after insert on template_usage_events
  for each row execute function bump_template_usage_counters();

-- Recompute the 7-day window from the raw events. Ages old clicks out and
-- self-corrects any drift.
create function recompute_template_use_count_7d() returns void
language sql
security definer
set search_path = ''
as $$
  update public.templates t
     set use_count_7d = (
       select count(*)
         from public.template_usage_events e
        where e.template_id = t.id
          and e.created_at > now() - interval '7 days'
     );
$$;

revoke execute on function recompute_template_use_count_7d() from public, anon, authenticated;

-- Backfill from existing events so nothing resets to zero.
update templates t
   set use_count_total = (select count(*) from template_usage_events e where e.template_id = t.id),
       last_used_at    = (select max(e.created_at) from template_usage_events e where e.template_id = t.id);
select recompute_template_use_count_7d();

-- Hourly recompute of the 7-day window.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'recompute-template-use-count-7d',
  '0 * * * *',
  $$select public.recompute_template_use_count_7d()$$
);
