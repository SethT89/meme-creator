-- ---------------------------------------------------------------------------
-- template_usage_events (one row per click on a template in the picker)
-- ---------------------------------------------------------------------------
create table template_usage_events (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references templates(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index template_usage_events_template_id_idx on template_usage_events (template_id);

alter table template_usage_events enable row level security;

create policy "v1 open read template_usage_events"  on template_usage_events for select using (true);
create policy "v1 open write template_usage_events" on template_usage_events for all    using (true) with check (true);

comment on table template_usage_events is 'One row per click on a template in the picker, logged regardless of whether the user ever saves anything — used to sort the template list by popularity.';

-- ---------------------------------------------------------------------------
-- templates.tags (unused by any UI yet — in place so a future filter UI is
-- a UI-only change, not a migration)
-- ---------------------------------------------------------------------------
alter table templates add column tags text[] not null default '{}';
create index templates_tags_idx on templates using gin (tags);

update templates set tags = array['reaction', 'decision'] where name = 'Two Buttons';
