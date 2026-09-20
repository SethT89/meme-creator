# Save + Export Usage Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record, per template, how many memes were saved (unique creations, Save As counts, re-saves don't) and how many were exported, and record work with no template (freeform) as events with an empty `template_id` — with no UI changes.

**Architecture:** One backward-compatible migration adds an `event_type` column (`pick`/`save`/`export`) and makes `template_id` nullable on `template_usage_events`, adds `save_count`/`export_count` to `templates`, replaces the counter trigger and the 7-day recompute so they respect `event_type`, and adds an `after insert` trigger on `creations` that logs a `save` event. The app logs an `export` event from `handleExport` after a completed download/share.

**Tech Stack:** Postgres/Supabase (triggers, pg_cron already installed), React + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-save-export-events-design.md`

**Rollout order matters:** the migration is backward compatible (the deployed app inserts click events without `event_type`, which defaults to `'pick'`), so it goes to production **first, with the owner's explicit OK**; the code is pushed after.

---

## File Structure

- Create: `supabase/migrations/20260920210000_save_export_events.sql` — schema, replaced triggers/functions, creations save trigger. (Renamed to the recorded version after applying.)
- Modify: `supabase/maintenance/reset-template-usage.sql` — also zero the two new counters.
- Modify: `src/types/database.ts` — new columns, nullable `template_id`.
- Modify: `src/lib/queries/templates.ts` — shared event insert, `event_type` on click logging, new `useLogExport`.
- Modify: `src/lib/queries/templates.test.tsx` — tests for both.
- Modify: `src/features/editor/EditorPage.tsx` — log an export event after a completed export.
- Modify: `src/features/editor/EditorPage.test.tsx` — capture usage inserts; export logging tests.

Work on a branch: `git checkout -b save-export-events` (never implement on `main`).

---

### Task 1: Write the migration

**Files:**
- Create: `supabase/migrations/20260920210000_save_export_events.sql`

- [ ] **Step 1: Create the migration file with this exact content**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260920210000_save_export_events.sql
git commit -m "feat: migration for save/export usage events and freeform (no-template) tracking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Verify the migration without keeping any change

Runs against the live database but **cannot persist**: the call ends in a deliberate `raise exception`, which aborts the implicit transaction and rolls back everything (schema and fake rows). Do not add `commit`. Never verify by saving real data — the fake `creations` rows below live only inside the rolled-back transaction.

**Files:** none (uses `mcp__supabase__execute_sql`; load with ToolSearch `select:mcp__supabase__execute_sql` if needed).

- [ ] **Step 1: Run the migration text plus the check below in ONE `execute_sql` call**

Send the full contents of the migration file from Task 1, immediately followed by:

```sql
do $$
declare
  tid uuid;
  b_total int; b_save int; b_export int;
  a_total int; a_save int; a_export int;
  sum_save_before int; sum_save_after int;
  sum_export_before int; sum_export_after int;
  save_events_before int; save_events_after int;
  null_saves_before int; null_saves_after int;
  cid uuid;
  a_7d int; expected_7d int;
begin
  select id into tid from templates order by name limit 1;

  -- 1. a click bumps only the pick counters
  select use_count_total, save_count, export_count into b_total, b_save, b_export from templates where id = tid;
  insert into template_usage_events (template_id) values (tid);            -- event_type defaults to 'pick'
  select use_count_total, save_count, export_count into a_total, a_save, a_export from templates where id = tid;
  if a_total <> b_total + 1 or a_save <> b_save or a_export <> b_export then
    raise exception 'FAIL pick: total % -> %, save % -> %, export % -> %', b_total, a_total, b_save, a_save, b_export, a_export;
  end if;

  -- 2. an export bumps only export_count
  b_total := a_total; b_save := a_save; b_export := a_export;
  insert into template_usage_events (template_id, event_type) values (tid, 'export');
  select use_count_total, save_count, export_count into a_total, a_save, a_export from templates where id = tid;
  if a_total <> b_total or a_save <> b_save or a_export <> b_export + 1 then
    raise exception 'FAIL export: total % -> %, save % -> %, export % -> %', b_total, a_total, b_save, a_save, b_export, a_export;
  end if;

  -- 3. a NEW template creation logs one save event and bumps save_count only
  b_total := a_total; b_save := a_save; b_export := a_export;
  select count(*) into save_events_before from template_usage_events where event_type = 'save' and template_id = tid;
  insert into creations (source_type, template_id, name) values ('template', tid, 'verify-template') returning id into cid;
  select use_count_total, save_count, export_count into a_total, a_save, a_export from templates where id = tid;
  select count(*) into save_events_after from template_usage_events where event_type = 'save' and template_id = tid;
  if a_total <> b_total or a_save <> b_save + 1 or a_export <> b_export or save_events_after <> save_events_before + 1 then
    raise exception 'FAIL new save: save % -> %, events % -> %', b_save, a_save, save_events_before, save_events_after;
  end if;

  -- 4. re-saving (an UPDATE of that row) logs nothing
  update creations set name = 'verify-template-resaved' where id = cid;
  select save_count into a_save from templates where id = tid;
  select count(*) into save_events_after from template_usage_events where event_type = 'save' and template_id = tid;
  if a_save <> b_save + 1 or save_events_after <> save_events_before + 1 then
    raise exception 'FAIL re-save counted: save_count %, events %', a_save, save_events_after;
  end if;

  -- 5. a freeform creation logs a save with no template and changes no template counter
  select coalesce(sum(save_count), 0) into sum_save_before from templates;
  select count(*) into null_saves_before from template_usage_events where event_type = 'save' and template_id is null;
  insert into creations (source_type, template_id, name) values ('freeform', null, 'verify-freeform');
  select coalesce(sum(save_count), 0) into sum_save_after from templates;
  select count(*) into null_saves_after from template_usage_events where event_type = 'save' and template_id is null;
  if null_saves_after <> null_saves_before + 1 or sum_save_after <> sum_save_before then
    raise exception 'FAIL freeform save: null events % -> %, sum save_count % -> %', null_saves_before, null_saves_after, sum_save_before, sum_save_after;
  end if;

  -- 6. a freeform export changes no template counter
  select coalesce(sum(export_count), 0) into sum_export_before from templates;
  insert into template_usage_events (template_id, event_type) values (null, 'export');
  select coalesce(sum(export_count), 0) into sum_export_after from templates;
  if sum_export_after <> sum_export_before then
    raise exception 'FAIL freeform export moved a counter: % -> %', sum_export_before, sum_export_after;
  end if;

  -- 7. the hourly recompute counts only clicks, not the saves/exports made above
  update templates set use_count_7d = 999 where id = tid;
  perform recompute_template_use_count_7d();
  select count(*) into expected_7d from template_usage_events
    where template_id = tid and event_type = 'pick' and created_at > now() - interval '7 days';
  select use_count_7d into a_7d from templates where id = tid;
  if a_7d <> expected_7d then
    raise exception 'FAIL recompute: % vs expected % (picks only)', a_7d, expected_7d;
  end if;

  -- 8. an unknown event type is rejected
  begin
    insert into template_usage_events (template_id, event_type) values (tid, 'bogus');
    raise exception 'FAIL bogus event type was accepted';
  exception when check_violation then
    null; -- expected
  end;

  raise exception 'VERIFY OK (rolled back): pick/export/save/re-save/freeform/recompute/check all behave';
end $$;
```

Expected: the call returns an error whose message starts `VERIFY OK (rolled back)`. Any message starting `FAIL` means fix the migration and re-run this task.

- [ ] **Step 2: Confirm nothing persisted**

Run via `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns where table_name = 'template_usage_events' and column_name = 'event_type') as event_type_col_exists,
  (select count(*) from information_schema.columns where table_name = 'templates' and column_name = 'save_count') as save_count_exists,
  (select count(*) from pg_trigger where tgname = 'creations_log_save_event') as save_trigger_exists,
  (select count(*) from creations) as creations_rows;
```

Expected: `0, 0, 0, 0`.

---

### Task 3: Update the types

**Files:**
- Modify: `src/types/database.ts` (`template_usage_events` block and `templates` block)

- [ ] **Step 1: `template_usage_events`** — in `Row` add `event_type: string` (alphabetical: after `id`) and change `template_id: string` to `template_id: string | null`. In `Insert` add `event_type?: string` and change `template_id: string` to `template_id?: string | null`. In `Update` add `event_type?: string` and change `template_id?: string` to `template_id?: string | null`.

- [ ] **Step 2: `templates`** — in `Row` add `export_count: number` (after `example_image_url`) and `save_count: number` (after `name`). In `Insert` and `Update` add `export_count?: number` and `save_count?: number` in the same alphabetical positions.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: add usage event event_type, nullable template_id, and save/export counters to database types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Generalize the event logger + add `useLogExport` (TDD)

**Files:**
- Modify: `src/lib/queries/templates.test.tsx`
- Modify: `src/lib/queries/templates.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/queries/templates.test.tsx`, change the import to add `useLogExport`:

```ts
import { useTemplates, useTemplateFields, useTemplatesByUsage, useLogTemplateUsage, useLogExport } from './templates'
```

Change the assertion in the existing `useLogTemplateUsage` test to:

```ts
    expect(lastUsageInsert).toEqual({ template_id: 't1', event_type: 'pick', user_id: CURRENT_USER_ID })
```

Append a new describe block at the end of the file:

```ts
describe('useLogExport', () => {
  it('inserts an export event for the template that was exported', async () => {
    const { result } = renderHook(() => useLogExport(), { wrapper })
    result.current.mutate('t1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUsageInsert).toEqual({ template_id: 't1', event_type: 'export', user_id: CURRENT_USER_ID })
  })

  it('inserts an export event with no template for freeform work', async () => {
    const { result } = renderHook(() => useLogExport(), { wrapper })
    result.current.mutate(null)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUsageInsert).toEqual({ template_id: null, event_type: 'export', user_id: CURRENT_USER_ID })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/queries/templates.test.tsx`
Expected: FAIL — `useLogExport` is not exported, and the pick insert has no `event_type`.

- [ ] **Step 3: Implement**

In `src/lib/queries/templates.ts`, replace `useLogTemplateUsage` with:

```ts
type UsageEventType = 'pick' | 'save' | 'export'

// A null template means the work did not use one (freeform). Saves are logged by a database
// trigger on `creations`, so app code only logs picks and exports.
async function insertUsageEvent(eventType: UsageEventType, templateId: string | null) {
  const { error } = await supabase
    .from('template_usage_events')
    .insert({ template_id: templateId, event_type: eventType, user_id: getCurrentUserId() })
  if (error) throw error
}

export function useLogTemplateUsage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) => insertUsageEvent('pick', templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', 'by-usage'] })
    },
  })
}

// Logs a completed export. Nothing on screen depends on it, so no cache invalidation.
export function useLogExport() {
  return useMutation({
    mutationFn: (templateId: string | null) => insertUsageEvent('export', templateId),
  })
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/lib/queries/templates.test.tsx && npx tsc -b`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/templates.ts src/lib/queries/templates.test.tsx
git commit -m "feat: log usage events by event type and add an export logger

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Log a completed export from the editor (TDD)

**Files:**
- Modify: `src/features/editor/EditorPage.test.tsx`
- Modify: `src/features/editor/EditorPage.tsx` (imports, hook call near the other query hooks, `handleExport` ~line 1162)

- [ ] **Step 1: Capture usage inserts in the test mock**

In `src/features/editor/EditorPage.test.tsx`, change the existing `vi.hoisted` block to also hold the captured inserts:

```ts
const { mockStorageUpload, usageInserts } = vi.hoisted(() => ({
  mockStorageUpload: vi.fn(
    (): Promise<{ data: { path: string } | null; error: { message: string } | null }> =>
      Promise.resolve({ data: { path: 'mock-path' }, error: null }),
  ),
  usageInserts: [] as Array<{ template_id: string | null; event_type: string }>,
}))
```

and change the `template_usage_events` branch of the supabase mock to record inserts:

```ts
      if (table === 'template_usage_events') {
        return {
          insert: (values: { template_id: string | null; event_type: string }) => {
            usageInserts.push(values)
            return Promise.resolve({ error: null })
          },
        }
      }
```

- [ ] **Step 2: Write the failing tests**

Inside `describe('Export', ...)`, in its `beforeEach`, add as the last line: `usageInserts.length = 0`. Then add a helper and tests at the end of that `describe` (before its closing `})`):

```ts
    const exportEvents = () => usageInserts.filter((event) => event.event_type === 'export')

    it('logs an export event for the template once a download succeeds', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await waitFor(() => expect(exportEvents()).toEqual([expect.objectContaining({ template_id: 'tmpl-1', event_type: 'export' })]))
    })

    it('logs an export event once a native share completes', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(true)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await waitFor(() => expect(exportEvents()).toHaveLength(1))
    })

    it('does not log an export when the user cancels the native share sheet', async () => {
      vi.mocked(canShareFile).mockReturnValue(true)
      vi.mocked(isMobileOrTabletDevice).mockReturnValue(true)
      const abortError = new Error('cancelled')
      abortError.name = 'AbortError'
      vi.mocked(shareFile).mockRejectedValue(abortError)
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await Promise.resolve()
      expect(exportEvents()).toHaveLength(0)
    })

    it('does not log an export when rendering fails', async () => {
      vi.mocked(renderCreationToBlob).mockRejectedValue(new Error('boom'))
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      expect(await screen.findByRole('status')).toHaveTextContent('failed')
      expect(exportEvents()).toHaveLength(0)
    })

    it('logs a freeform export with no template', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('vacation.png')
      await screen.findByAltText('')
      await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled())

      await userEvent.click(screen.getByRole('button', { name: 'Export' }))

      await waitFor(() => expect(exportEvents()).toEqual([expect.objectContaining({ template_id: null, event_type: 'export' })]))
    })
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/features/editor/EditorPage.test.tsx -t "Export"`
Expected: the two "logs an export event…" tests and the freeform test FAIL (no export events are logged yet); the two "does not log" tests pass trivially.

- [ ] **Step 4: Implement**

In `src/features/editor/EditorPage.tsx`: add `useLogExport` to the import from `../../lib/queries/templates` (add the import line if EditorPage doesn't import from that module yet: `import { useLogExport } from '../../lib/queries/templates'`); next to the other query hooks (`useCreateCreation` / `useUpdateCreation`) add:

```ts
  const logExport = useLogExport()
```

In `handleExport`, compute the template id once after the `if (!source ...) return` guard:

```ts
    const templateId = source.type === 'template' ? source.templateId : null
```

then log after each success path — after `await shareFile(file, filename)` add `logExport.mutate(templateId)` (before the `setToast` line), and after `downloadBlob(blob, filename)` add `logExport.mutate(templateId)`. Do **not** log in the `AbortError` or failure branches. `mutate` never throws, so a logging failure cannot affect the export.

- [ ] **Step 5: Run the full suite, typecheck, lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: all PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/EditorPage.tsx src/features/editor/EditorPage.test.tsx
git commit -m "feat: log an export usage event after a completed download or share

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Update the pre-launch reset script

**Files:**
- Modify: `supabase/maintenance/reset-template-usage.sql`

- [ ] **Step 1: Replace the file's contents with**

```sql
-- Pre-launch reset of template usage data. NOT a migration — never runs automatically.
-- Run manually, only on the owner's explicit go-ahead, right before real users arrive:
-- everything logged before then is test data under the shared v1 user id.
--
-- Deletes every usage event (picks, saves, exports) and zeroes the cached counters on templates.
-- It does NOT delete saved creations — those are real rows in My Saves.
delete from template_usage_events;

update templates
   set use_count_total = 0,
       use_count_7d    = 0,
       last_used_at    = null,
       save_count      = 0,
       export_count    = 0;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/maintenance/reset-template-usage.sql
git commit -m "docs: extend the manual pre-launch reset to the save/export counters

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Apply to production (REQUIRES the owner's explicit OK) and ship

- [ ] **Step 1: Ask the owner for an explicit OK.** State plainly: adds an `event_type` column and a check constraint, makes `template_id` nullable on the events table, adds two columns to `templates`, replaces two functions, and adds a trigger on `creations`. Backward compatible with the deployed app.

- [ ] **Step 2: Apply** with `mcp__supabase__apply_migration`, name `save_export_events`, using the migration file's SQL. Then `mcp__supabase__list_migrations` and rename the file to the recorded version (`git mv`), and fix the filename mention at the top of this plan.

- [ ] **Step 3: Verify in production (read-only)**

```sql
select name, use_count_total, use_count_7d, save_count, export_count from templates order by use_count_total desc, name;
select event_type, count(*) from template_usage_events group by event_type;
select count(*) as creations_rows from creations;
```

Expected: pick counters unchanged from before the migration, `save_count`/`export_count` all `0`, every existing event has `event_type = 'pick'`, `creations_rows = 0`. Then run `mcp__supabase__get_advisors` (security); the new `log_creation_save_event` already has EXECUTE revoked, so expect no new findings — revoke and re-check if any appear.

- [ ] **Step 4: Regenerate types** with `mcp__supabase__generate_typescript_types` and confirm the `templates` and `template_usage_events` blocks match the hand edit; fix and commit any difference.

- [ ] **Step 5: Try one real export locally, against production.** The dev server on port 5173 serves the checked-out branch. Open it, pick a template, click Export, then run:

```sql
select event_type, template_id, user_id, created_at from template_usage_events where event_type = 'export' order by created_at desc limit 1;
select name, export_count from templates where export_count > 0;
```

Expected: one `export` event with the template's id and the v1 user id, and that template's `export_count` is `1`. This is one real test event that the pre-launch reset will wipe. **Do not press Save** to test saves — the rolled-back verification in Task 2 already covered the save trigger; never verify with real saved data.

- [ ] **Step 6: Merge to `main`, re-run `npm test && npx tsc -b && npm run lint` on the merged result, push** (`git push origin main`), and delete the branch. Cloudflare Pages auto-deploys `main`; confirm the new bundle is live (e.g. the built JS contains `export_count`-related insert code / the string `'export'` event event_type) and the sidebar still loads with no console errors.

- [ ] **Step 7: Update project memory** — `template-usage-counters.md` (what shipped: `event_type`, nullable `template_id`, `save_count`/`export_count`, creations trigger, freeform = empty template, the freeform-share query from the spec, that the recompute counts picks only, the FK `on delete cascade` must stay) and the roadmap's launch checklist (the reset script now also zeroes the two counters and still needs the owner's explicit OK).
