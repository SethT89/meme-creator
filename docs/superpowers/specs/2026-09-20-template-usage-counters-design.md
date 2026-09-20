# Template usage counters + per-user event capture — Design

## Problem

The sidebar orders templates by popularity, but `useTemplatesByUsage` downloads **every**
row of `template_usage_events` and counts them in the browser. That is fine for a handful
of templates and breaks down as the catalog and traffic grow. Separately, events record
*what* was clicked but not *who* clicked it, so a future "your favorites" view could never
be built from the history collected so far.

## Decision

1. **Cache the counts on the `templates` row** and sort on those. The raw events table
   stays as the source of truth.
2. **Add `user_id` to events now**, so per-person data accrues from the moment real
   accounts exist. **No UI changes** — no Favorites / Trending views yet.

## Schema (one migration)

`templates` gains:

| column | type | meaning |
|---|---|---|
| `use_count_total` | `integer not null default 0` | all-time clicks |
| `use_count_7d` | `integer not null default 0` | clicks in the last 7 days |
| `last_used_at` | `timestamptz null` | most recent click |

`template_usage_events` gains:

- `user_id uuid not null default '00000000-0000-0000-0000-000000000001'` — the same v1
  default every other table uses (see `init.sql`). Existing rows take the default.
  No FK yet: add `references auth.users(id)` when auth lands, as `init.sql` already notes.
- index `(user_id, template_id)` — makes a future per-person "favorites" query a small,
  fast lookup, so it needs no cached counts of its own.

**Insert trigger** on `template_usage_events` (`security definer`, `search_path = ''`):
`use_count_total += 1`, `use_count_7d += 1`, `last_used_at = new.created_at` on the
matching template. Atomic, so concurrent clicks cannot lose an update. Bumping the 7-day
counter here too means a click shows up immediately instead of at the next hourly run.

**Hourly `pg_cron` job** (`create extension pg_cron`; available on this project, not yet
installed): recompute `use_count_7d` for every template from events newer than 7 days.
Its real job is aging old clicks out of the window; it also self-corrects any drift.
The count can be up to an hour stale on the *down* side only, which is fine for ranking.

**Backfill** in the same migration: set all three columns from the existing events, so
nothing resets to zero.

`save_count` is deliberately **not** added. Saves already live in `creations`; the counter
can be added later without losing anything.

## App code

- `useTemplatesByUsage`: select `templates` only, ordered by
  `use_count_total desc, name asc` — **the same visible order as today.** No events fetch.
  (Switching the sidebar to trending is a one-line change to this `order`, and is left for
  when there is real traffic to rank.)
- Delete `src/lib/templateUsage.ts` and its test (`sortTemplatesByUsage` is replaced by
  the database ordering).
- `useLogTemplateUsage`: insert `{ template_id, user_id: getCurrentUserId() }`. Today that
  returns the v1 constant; when auth arrives it becomes the signed-in id and events are
  attributed automatically.
- Regenerate `src/types/database.ts` for the new columns.

## Pre-launch reset

Everything logged so far is the owner's own testing, all under the single shared v1 user
id, so it says nothing about real users. Before real users arrive, wipe it. Kept as a
ready-to-run script, **not** a migration (it must never run automatically):
`supabase/maintenance/reset-template-usage.sql` —
`delete from template_usage_events; update templates set use_count_total = 0, use_count_7d = 0, last_used_at = null;`
Run only on the owner's explicit go-ahead.

## Testing and rollout

- Unit tests: the new `useTemplatesByUsage` (ordering args, no events fetch) and the
  `user_id` on the logged event.
- SQL verified **inside a rolled-back transaction** on the live database (insert fake
  events → check trigger counts → run the recompute → check the window → rollback), so
  no real data is touched.
- The migration is applied to production only after the owner's explicit OK, as with the
  gallery-preview migration.

## Out of scope

Favorites / Trending / All-time views, a Trending badge, an anonymous per-browser id,
`save_count`, daily buckets, event rollup or deletion of old events.
