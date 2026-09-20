-- ---------------------------------------------------------------------------
-- Save + export usage events, and "no template" (freeform) events
-- Spec: docs/superpowers/specs/2026-09-20-save-export-events-design.md
-- Builds on 20260920195906_template_usage_counters.
--
-- Backward compatible: the deployed app inserts click events without `event_type`
-- (defaults to 'pick') and never reads events, so it keeps working unchanged.
-- ---------------------------------------------------------------------------

-- What happened. text + check (not an enum) so adding an event type later is a one-line change.
alter table template_usage_events
  add column event_type text not null default 'pick',
  add constraint template_usage_events_event_type_check check (event_type in ('pick', 'save', 'export'));

-- Empty template_id = the work did not use a template (freeform). The FK keeps
-- `on delete cascade` on purpose: `set null` would relabel a deleted template's
-- history as freeform activity.
alter table template_usage_events alter column template_id drop not null;

create index template_usage_events_event_type_template_idx
  on template_usage_events (event_type, template_id);

comment on column template_usage_events.event_type is 'pick = clicked a template, save = a new creation was saved (Save / Save As, not a re-save), export = a completed download/share.';
comment on column template_usage_events.template_id is 'Null = the work did not use a template (freeform).';

alter table templates
  add column save_count   integer not null default 0,
  add column export_count integer not null default 0;

comment on column templates.save_count   is 'Unique creations saved from this template (Save As counts, re-saves do not). Maintained by trigger.';
comment on column templates.export_count is 'Completed exports of this template. Maintained by trigger.';

-- Keep the counters current. Only 'pick' events touch the pick counters, so the
-- sidebar order/meaning is unchanged. Events with no template change no counter.
-- (create or replace keeps the existing trigger and the revoked EXECUTE grants.)
create or replace function bump_template_usage_counters() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.template_id is null then
    return new;
  end if;

  if new.event_type = 'pick' then
    update public.templates
       set use_count_total = use_count_total + 1,
           use_count_7d    = use_count_7d + case when new.created_at > now() - interval '7 days' then 1 else 0 end,
           last_used_at    = greatest(coalesce(last_used_at, new.created_at), new.created_at)
     where id = new.template_id;
  elsif new.event_type = 'save' then
    update public.templates set save_count = save_count + 1 where id = new.template_id;
  elsif new.event_type = 'export' then
    update public.templates set export_count = export_count + 1 where id = new.template_id;
  end if;
  return new;
end;
$$;

-- The hourly 7-day recompute must only count clicks, or it would start counting
-- saves and exports as "clicks in the last 7 days".
create or replace function recompute_template_use_count_7d() returns void
language sql
security definer
set search_path = ''
as $$
  update public.templates t
     set use_count_7d = (
       select count(*)
         from public.template_usage_events e
        where e.template_id = t.id
          and e.event_type = 'pick'
          and e.created_at > now() - interval '7 days'
     );
$$;

-- Log a save whenever a NEW creation row is created. Save and Save As both insert
-- a row; a quick re-save is an update, so it logs nothing. Server-side, so it
-- can't be forgotten or double-fired by app code, and deleting the meme later
-- does not erase the event. Freeform creations have a null template_id.
create function log_creation_save_event() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.template_usage_events (template_id, user_id, event_type)
  values (new.template_id, new.user_id, 'save');
  return new;
end;
$$;

revoke execute on function log_creation_save_event() from public, anon, authenticated;

create trigger creations_log_save_event
  after insert on creations
  for each row execute function log_creation_save_event();
