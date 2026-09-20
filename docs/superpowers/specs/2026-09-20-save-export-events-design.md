# Save + export usage events (incl. "no template") — Design

Builds on `2026-09-20-template-usage-counters-design.md` (live). No UI changes.

## Problem

Today the only usage signal is a *click* on a template. A click is a weak signal: the owner
expects many people to export and post to social without ever saving, and the app also
supports work with no template at all (a blank canvas with an uploaded image). We want to
know, per template, how many memes were **saved** and **exported**, and how often people
**don't use a template at all**.

## Decisions (made with the owner)

- **Saves count unique creations.** A brand-new save counts; **Save As counts** (it is a new
  creation); re-saving an existing meme does **not**.
- **Exports count completed exports.** A cancelled or failed export does not count.
- **Freeform ("no template") lives in the same events table**, with an empty `template_id`.
  No fake "custom" template row and no special value: *empty template = the work did not
  use one*.
- The share of work that skips templates is answered with a plain query (below), not a
  cached counter.

## Schema (one migration, backward compatible)

`template_usage_events`:
- `kind text not null default 'pick'`, `check (kind in ('pick','save','export'))`.
  Existing rows and the currently deployed app (which inserts without `kind`) stay `'pick'`.
  `text` + `check` rather than an enum so a new kind later is a one-line constraint change.
- `template_id` becomes **nullable** (null = no template / freeform). The FK keeps
  `on delete cascade` — **do not change this to `set null`**: it would silently relabel a
  deleted template's history as "freeform" activity.
- index `(kind, template_id)` for the by-kind and freeform queries.

`templates` gains `save_count integer not null default 0` and `export_count integer not null
default 0`.

**Counter trigger** (`bump_template_usage_counters`, replaced): does nothing when
`new.template_id is null`; otherwise by `new.kind`:
- `pick`: as today (`use_count_total`, `use_count_7d`, `last_used_at`).
- `save`: `save_count += 1`.
- `export`: `export_count += 1`.

Only `pick` events may touch the pick counters, so the sidebar's order and meaning are
unchanged.

**7-day recompute** (`recompute_template_use_count_7d`, replaced): must add
`and e.kind = 'pick'`. Without it, the hourly job would start counting saves and exports as
"clicks in the last 7 days".

**Saves are logged by a database trigger on `creations`** (`after insert`, `security definer`,
`search_path = ''`, execute revoked from public/anon/authenticated): inserts a
`kind = 'save'` event with the new row's `template_id` (null for freeform) and `user_id`.
Save and Save As both `insert` a creations row; a quick re-save is an `update`, so it logs
nothing. Being server-side, it cannot be forgotten or double-fired by app code, and deleting
the meme later does not erase the event. `creations` is empty today, so there is nothing
to backfill.

## App code

- **Exports** are logged from the client, since nothing server-side sees an export. In
  `handleExport` (`EditorPage.tsx`), log a `kind = 'export'` event **only after** the
  download succeeds or the native share resolves — not when the user cancels the share sheet
  (`AbortError`) and not on failure. `template_id` is `source.templateId` for a template
  source, `null` for freeform. Best-effort and fire-and-forget: a logging failure must never
  affect or surface during an export.
- `src/lib/queries/templates.ts`: generalize the existing click logger so one mutation logs
  any kind, sending `{ template_id, kind, user_id: getCurrentUserId() }`. Click logging
  keeps its current behavior.
- Regenerate `src/types/database.ts`.
- Saves need **no** app code (the trigger does it).

## Answering "how often do people skip templates?"

No UI; a query the owner can run in Supabase, e.g. for exports:

```sql
select count(*) filter (where template_id is null) as freeform,
       count(*) filter (where template_id is not null) as template,
       round(100.0 * count(*) filter (where template_id is null) / nullif(count(*), 0), 1) as freeform_pct
from template_usage_events where kind = 'export';   -- same with kind = 'save'
```

Freeform has no `templates` row to hold a counter, so it is always counted from events.

## Pre-launch reset

`supabase/maintenance/reset-template-usage.sql` must also zero `save_count` and
`export_count`. It still deletes all events (all kinds).

## Testing and rollout

- Rolled-back verification on the live database (same technique as before: migration + a
  `DO` block ending in `raise exception`, then confirm nothing persisted), covering:
  a template pick still bumps only the pick counters; inserting a `creations` row (template
  and freeform) logs a save and bumps `save_count` only for the template one; an `update`
  of that row logs nothing; an export event bumps `export_count`; a null-template event
  changes no counter; the 7-day recompute ignores saves/exports.
- Unit tests for the generalized logger and for `handleExport` logging on download success,
  on share success, not on share cancel, not on failure, and `null` template for freeform.
- Migration applied to production only after the owner's explicit OK, **before** the code is
  pushed (it is backward compatible). Advisor re-checked afterwards.

## Out of scope

Any UI (Favorites / Trending views, badges); weighting the sidebar order by saves or exports;
7-day variants of the new counters; de-duplicating repeated exports of the same meme (each
completed export counts); a cached freeform counter; an "anonymous device id".
