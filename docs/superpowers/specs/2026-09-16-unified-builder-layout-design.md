# Unified Builder Layout — Design

## Purpose

Today, picking a template and building a meme are two separate full-page
states inside `EditorPage`: a picker (`EditorEmptyState`, a 4-column grid of
template tiles + an upload dropzone) that gets replaced entirely by the
canvas once something is chosen. The user wants this to feel like one
continuous page instead: a persistent template-picking panel on the left,
canvas on the right, always both visible.

This also folds in three related, smaller decisions made along the way:
- Track template popularity (every click, not just saves) so the left panel
  can show "most used" first — with an eye toward a future free-tier/paid-tier
  split where saving may require an account but picking a template never does.
- Add a `tags text[]` column to `templates` now (unused by any UI yet) so a
  future filter UI in the search modal has something to filter on without a
  migration at that point.
- Rename "Start Over" to "Clear Canvas" and require confirmation before it
  discards canvas state — and reuse that same confirmation when switching to
  a different template while the canvas already has something loaded.

## Data model

### `template_usage_events` (new table)

```sql
create table template_usage_events (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references templates(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index template_usage_events_template_id_idx on template_usage_events (template_id);
```

One row per click on a template, logged whether or not the user ever saves
anything — this is deliberately a raw event log, not a denormalized counter
on `templates`, so it stays useful as a real dataset later (trends over
time, eventually per-session/per-user once auth exists) rather than just a
single mutable number. "Most used" for sorting is a `GROUP BY template_id,
COUNT(*)` over this table, which is trivial at today's catalog size and can
be revisited (e.g. a materialized view) only if it ever stops being trivial.
RLS: permissive insert/select, matching every other table in this schema
for v1.

### `templates.tags` (new column)

```sql
alter table templates add column tags text[] not null default '{}';
create index templates_tags_idx on templates using gin (tags);
```

Same pattern already used by `creations.tags` — a real Postgres array, each
tag a separate queryable element (`WHERE 'reaction' = ANY(tags)`, or `WHERE
tags && ARRAY['reaction','funny']` for "any of these"). Not written or read
by any UI in this round — just in place so adding filters later is a UI-only
change, not a migration. The existing Two Buttons template gets a couple of
example tags (e.g. `{'reaction','decision'}`) so the column isn't sitting
empty, but no admin UI to manage tags is being built now (there isn't one
for templates at all yet — tracked as its own future sub-project).

## Layout architecture

### The `max-w-2xl` cap moves from `AppShell` back to each page

`AppShell` currently wraps every routed page in a shared `mx-auto max-w-2xl
p-8` div (fixed in the last round specifically so page headers wouldn't
shift position when toggling New Meme / My Saved Memes). A sidebar+canvas
builder needs much more horizontal space than 672px, so that shared cap has
to go — but the *reason* for that fix (consistent left-edge position across
pages) still matters and shouldn't regress.

Fix: `AppShell` keeps the shared `p-8` (consistent gutter/left-edge on every
page) but drops `max-w-2xl`. Each page now owns its own content width
again: `GalleryPage` wraps its own content in `max-w-2xl` internally (no
visible change there), the new builder page uses the full available width.
Left-edge position stays identical across pages either way, since it's
driven by the shared `p-8`, not by where a `max-w` cap happens to end.

`AppShell`'s `<main>` is already `flex-1` (fills remaining viewport height).
The `p-8` wrapper div becomes `flex h-full flex-col` so a page that wants to
fill available height (the builder's two-pane layout, so the sidebar can
scroll independently and the canvas doesn't force page-level scrolling) can
opt in with its own `flex-1`, without forcing that on pages that don't need
it (Gallery keeps its natural content-height sizing).

### Page structure

`EditorPage` stops early-returning to a separate `EditorEmptyState` full
page when `!source`. Instead it always renders two panes:

```
<div className="flex h-full gap-6">
  <TemplateSidebar
    selectedTemplateId={source?.type === 'template' ? source.templateId : undefined}
    onSelectTemplate={handleSelectTemplate}
  />
  <div className="flex-1 ...">
    {/* existing toolbar row + canvas, canvas shows the checkerboard
        background with no image/fields when source is null */}
  </div>
</div>
```

`EditorEmptyState.tsx` is deleted — its template-grid rendering logic and
`SelectedTemplate` type move into `TemplateSidebar`, minus the upload
dropzone (explicitly deferred — freeform starts, per the user, from a
future in-canvas "+" button, not a separate entry point).

## New components

### `TemplateSidebar` (`src/features/editor/TemplateSidebar.tsx`)

- Fixed-width column (e.g. `w-56`), `flex flex-col h-full`.
- Scrollable vertical list of template rows (thumbnail + name), ordered by
  usage count descending — each click both selects the template *and* logs
  a usage event.
- A "Search All Memes" button pinned to the bottom (`mt-auto`, not part of
  the scrolling list) that opens `SearchTemplatesModal`.
- On a viewport narrower than `sm`, the list becomes a collapsible drawer:
  collapsed by default, a toggle button in its place; expanding overlays it
  as a slide-out panel above the canvas rather than pushing layout around.

### `SearchTemplatesModal` (`src/features/editor/SearchTemplatesModal.tsx`)

- Same modal shell as `SaveDialog` (`role="dialog"`, `fixed inset-0 ...
  bg-black/50`, centered card) but wider, to comfortably show a grid.
- A search input filtering the full template list by name (client-side
  `includes`, case-insensitive — the catalog is small enough that this
  doesn't need a server round-trip yet).
- Grid of template tiles (reusing the existing `aspect-square` tile styling
  from the old `EditorEmptyState`). Picking one calls the same
  `onSelectTemplate` handler as the sidebar, closes the modal.
- No filter controls in this round (see Data model above for why the tags
  column exists without a filter UI yet).

### `ConfirmDialog` (`src/components/ui/ConfirmDialog.tsx`)

Generic, reusable — not specific to Clear Canvas:

```ts
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}
```

Same modal shell as `SaveDialog`/`SearchTemplatesModal`. Used for two
distinct actions in this round (see Interaction flow), and available for
any future destructive-action confirmation without writing another modal.

## Interaction flow

**Selecting a template** (from the sidebar or the search modal) goes
through one shared handler:

```ts
function handleSelectTemplate(template: SelectedTemplate) {
  if (source !== null) {
    // Canvas has something loaded (template or freeform) — confirm before
    // discarding it, same as Clear Canvas. If the canvas is already blank,
    // there's nothing to lose, so this skips straight to loading it.
    setPendingTemplate(template)
    setConfirmOpen(true)
  } else {
    loadTemplate(template)
  }
}
```

Confirming calls `loadTemplate(pendingTemplate)` (same logic `onSelectTemplate`
used to run) and clears `savedMeta`/`layers`/`selectedFieldId` first, exactly
like Clear Canvas does. This means picking *the same* template you already
have loaded also technically prompts — acceptable over-caution rather than
building real content-diffing to special-case it.

**Clear Canvas** — same rename + confirmation, reusing `ConfirmDialog`. The
button itself is only rendered when `source !== null` (nothing to clear
otherwise, so no point showing a control that always needs a confirm for a
no-op). Confirming resets `source`/`savedMeta`/`layers`/`selectedFieldId` to
their initial empty values (what `startOver()` already does) and, if a
`creationId` route param is present, navigates back to `/` — unchanged from
today's `startOver()` behavior, just renamed and gated behind confirmation.

**Usage logging** — fires on every template click (sidebar row or search
modal tile), regardless of whether that click goes on to trigger the
confirm-dialog flow above. A pick that gets cancelled at the confirmation
step still counted as a "click" for popularity purposes, which matches the
stated goal (track clicks broadly for a bigger dataset, not just completed
switches).

## Testing

- `template_usage_events` insert + the most-used ordering query get the
  same supabase-mock test pattern already used for `templates.test.tsx` and
  `creations.test.tsx`.
- `ConfirmDialog`: renders when `open`, calls `onConfirm`/`onCancel`,
  doesn't render when `!open` — mirrors the existing `SaveDialog` test
  shape.
- `TemplateSidebar`: renders templates in usage-descending order (given a
  mocked usage-ordered query result), clicking a row calls
  `onSelectTemplate` with the right shape, "Search All Memes" opens the
  modal.
- `SearchTemplatesModal`: typing in the search box filters the visible
  tiles by name; picking a tile calls `onSelectTemplate` and closes.
- `EditorPage`: Clear Canvas button hidden when canvas is blank, shown
  otherwise; clicking it opens the confirm dialog instead of clearing
  immediately; confirming actually clears; picking a different template
  while one is already loaded opens the same confirm dialog; picking a
  template while the canvas is blank loads it with no dialog.
- The mobile drawer's collapse/expand and the overall two-pane visual
  layout get verified live in the browser (real layout/viewport behavior,
  not meaningfully jsdom-testable), same approach as the drag/resize work.

## Out of scope (explicitly deferred)

- Any filter UI reading `templates.tags` — the column exists, nothing
  queries it yet.
- Freeform "start blank" entry point — deferred to a future in-canvas "+"
  button that adds images/stickers/text/shapes directly, replacing the old
  upload-dropzone-as-a-starting-choice model entirely.
- Admin UI for managing templates or their tags (still hand-seeded).
- Any actual account/paid-tier gating — the usage-tracking table is built
  with that eventual direction in mind (logging clicks broadly, not
  requiring a logged-in user), but no auth work happens in this round.
