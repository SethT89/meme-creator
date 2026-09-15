-- Add user-facing name + free-text tags to creations, needed for the
-- My Creations gallery (search/filter by tag; display name in cards).
alter table creations
  add column name text not null default 'Untitled',
  add column tags text[] not null default '{}';

comment on column creations.name is 'User-entered or auto-generated display name, e.g. "Drake 1".';
comment on column creations.tags is 'Free-text tags for search/filter. No fixed taxonomy, no separate tags table.';
