-- Meme Creator — initial schema
-- See docs/meme-app-spec.md for the full spec.
--
-- Auth note: v1 has no authentication. Every row carries a `user_id` so that
-- real multi-user auth can be added later WITHOUT a schema rewrite. Until then
-- all rows use a single hardcoded dev user id (see DEFAULT below and seed.sql).
-- When auth lands: add `REFERENCES auth.users(id)` to the user_id columns and
-- tighten the RLS policies at the bottom of this file.

create extension if not exists "pgcrypto";

-- The single hardcoded user for v1 is 00000000-0000-0000-0000-000000000001
-- (see the column DEFAULTs below, .env.example, and seed.sql).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type creation_source_type as enum ('template', 'freeform');
create type creation_status as enum ('draft', 'final');

-- ---------------------------------------------------------------------------
-- templates (shared/global, admin-created)
-- ---------------------------------------------------------------------------
create table templates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  blank_image_url   text not null,
  example_image_url text not null,
  created_by        uuid not null default '00000000-0000-0000-0000-000000000001',
  created_at        timestamptz not null default now()
);

comment on table templates is 'Recognizable meme formats (Drake, Distracted Boyfriend, ...). Shared across all users; only an admin creates them.';

-- ---------------------------------------------------------------------------
-- template_fields (per-template positioned text fields)
-- ---------------------------------------------------------------------------
create table template_fields (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references templates(id) on delete cascade,
  label        text not null,
  position_x   double precision not null default 0,
  position_y   double precision not null default 0,
  width        double precision not null default 200,
  height       double precision not null default 80,
  rotation     double precision not null default 0,
  font_size    double precision not null default 32,
  order_index  integer not null default 0
);

create index template_fields_template_id_idx on template_fields (template_id, order_index);

comment on table template_fields is 'Default label/position/size/rotation for each editable field of a template. Copied onto the canvas when a user starts from the template, then fully editable.';

-- ---------------------------------------------------------------------------
-- creations (every meme made — template-based or freeform — one unified gallery)
-- ---------------------------------------------------------------------------
create table creations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default '00000000-0000-0000-0000-000000000001',
  source_type         creation_source_type not null,
  template_id         uuid references templates(id) on delete set null,
  status              creation_status not null default 'draft',
  canvas_data         jsonb not null default '{}'::jsonb,
  exported_image_url  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- template_id is only meaningful for template-sourced creations
  constraint creations_template_id_matches_source
    check (source_type = 'template' or template_id is null)
);

create index creations_user_id_idx on creations (user_id, updated_at desc);
create index creations_template_id_idx on creations (template_id);

comment on table creations is 'Personal gallery ("My Creations"). Saved as draft while editing, promoted to final on export. canvas_data holds the full layer state.';

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger creations_set_updated_at
  before update on creations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
-- template-images : blank + example images for templates (admin uploads)
-- creation-assets : user-uploaded background images for freeform creations
-- creation-exports: rendered PNG exports of finished creations
insert into storage.buckets (id, name, public)
values
  ('template-images',  'template-images',  true),
  ('creation-assets',  'creation-assets',  true),
  ('creation-exports', 'creation-exports', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- v1 has no auth, and the client uses the anon key. Enable RLS now (so the
-- switch to real per-user policies later is additive, not a security scramble)
-- but allow the anon + authenticated roles full access for now.
alter table templates       enable row level security;
alter table template_fields enable row level security;
alter table creations       enable row level security;

create policy "v1 open read templates"        on templates       for select using (true);
create policy "v1 open write templates"       on templates       for all    using (true) with check (true);
create policy "v1 open read template_fields"  on template_fields for select using (true);
create policy "v1 open write template_fields" on template_fields for all    using (true) with check (true);
create policy "v1 open read creations"        on creations       for select using (true);
create policy "v1 open write creations"       on creations       for all    using (true) with check (true);

-- Storage object policies: open for v1 (anon read + write on the three buckets).
create policy "v1 open read meme storage" on storage.objects
  for select using (bucket_id in ('template-images', 'creation-assets', 'creation-exports'));
create policy "v1 open write meme storage" on storage.objects
  for all using (bucket_id in ('template-images', 'creation-assets', 'creation-exports'))
  with check (bucket_id in ('template-images', 'creation-assets', 'creation-exports'));
