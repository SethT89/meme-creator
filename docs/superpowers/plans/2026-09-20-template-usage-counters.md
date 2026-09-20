# Template Usage Counters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache template click counts on the `templates` row (so the sidebar sorts without downloading every event) and record which user made each click, with no visible UI change.

**Architecture:** One backward-compatible SQL migration adds counter columns to `templates`, a `user_id` column to `template_usage_events`, an insert trigger that keeps the counters current, an hourly `pg_cron` job that ages clicks out of the 7-day window, and a backfill. The app then reads `templates` ordered by the cached all-time counter (same visible order as today) and passes `user_id` when logging a click.

**Tech Stack:** Postgres/Supabase (migration, trigger, pg_cron), React + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-template-usage-counters-design.md`

**Rollout order matters:** the migration is backward compatible (old code keeps working after it), so it goes to production **first, with the owner's explicit OK**; the code is pushed after. Never the other way round — new code selects columns that don't exist until the migration is applied.

---

## File Structure

- Create: `supabase/migrations/20260920195906_template_usage_counters.sql` — all schema changes, trigger, cron job, backfill.
- Create: `supabase/maintenance/reset-template-usage.sql` — manual pre-launch wipe. **Not** a migration; never runs automatically.
- Modify: `src/types/database.ts` — new columns on `templates` and `template_usage_events`.
- Modify: `src/lib/queries/templates.ts` — `useTemplatesByUsage` reads `templates` ordered by counter; `useLogTemplateUsage` sends `user_id`.
- Modify: `src/lib/queries/templates.test.tsx` — tests for both.
- Delete: `src/lib/templateUsage.ts`, `src/lib/templateUsage.test.ts` — replaced by database ordering.

---

### Task 1: Write the migration

**Files:**
- Create: `supabase/migrations/20260920195906_template_usage_counters.sql`

- [ ] **Step 1: Create the migration file with this exact content**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260920195906_template_usage_counters.sql
git commit -m "feat: migration for cached template usage counters and per-user event capture

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Verify the migration without keeping any change

This runs against the live database but **cannot persist**: the whole call ends in a deliberate `raise exception`, which aborts the implicit transaction and rolls back everything (schema and fake rows). Do not add `commit`.

**Files:** none (uses `mcp__supabase__execute_sql`; load it with ToolSearch `select:mcp__supabase__execute_sql` if needed).

- [ ] **Step 1: Run the migration text plus the check below in ONE `execute_sql` call**

Send the full contents of the migration file from Task 1, immediately followed by:

```sql
do $$
declare
  tid uuid;
  before_total int;
  before_7d int;
  after_total int;
  after_7d int;
  expected_7d int;
  last_used timestamptz;
begin
  select id, use_count_total, use_count_7d into tid, before_total, before_7d
    from templates order by name limit 1;

  -- 3 clicks now, 2 clicks backdated 10 days (outside the window)
  insert into template_usage_events (template_id) values (tid), (tid), (tid);
  insert into template_usage_events (template_id, created_at)
    values (tid, now() - interval '10 days'), (tid, now() - interval '10 days');

  select use_count_total, use_count_7d, last_used_at into after_total, after_7d, last_used
    from templates where id = tid;

  if after_total <> before_total + 5 then
    raise exception 'FAIL total: % -> %', before_total, after_total;
  end if;
  if after_7d <> before_7d + 3 then
    raise exception 'FAIL 7d after trigger: % -> % (expected +3)', before_7d, after_7d;
  end if;
  if last_used < now() - interval '1 minute' then
    raise exception 'FAIL last_used_at not bumped: %', last_used;
  end if;

  -- corrupt the 7d counter, then prove the recompute repairs it
  update templates set use_count_7d = 999 where id = tid;
  perform recompute_template_use_count_7d();
  select count(*) into expected_7d from template_usage_events
    where template_id = tid and created_at > now() - interval '7 days';
  select use_count_7d into after_7d from templates where id = tid;
  if after_7d <> expected_7d then
    raise exception 'FAIL recompute: % vs expected %', after_7d, expected_7d;
  end if;

  if not exists (select 1 from cron.job where jobname = 'recompute-template-use-count-7d') then
    raise exception 'FAIL cron job missing';
  end if;

  raise exception 'VERIFY OK (rolled back): total +5, 7d +3, recompute repaired to %', expected_7d;
end $$;
```

Expected: the call returns an error whose message starts `VERIFY OK (rolled back)`. Any message starting `FAIL` means fix the migration and re-run this task.

- [ ] **Step 2: Confirm nothing persisted**

Run via `execute_sql`:

```sql
select
  (select count(*) from information_schema.columns
    where table_name = 'templates' and column_name = 'use_count_total') as counter_col_exists,
  (select count(*) from information_schema.columns
    where table_name = 'template_usage_events' and column_name = 'user_id') as user_id_col_exists,
  (select count(*) from pg_extension where extname = 'pg_cron') as cron_installed;
```

Expected: all three are `0`.

---

### Task 3: Update the generated types

**Files:**
- Modify: `src/types/database.ts` (the `template_usage_events` block ~line 114 and the `templates` block ~line 140)

- [ ] **Step 1: Add `user_id` to `template_usage_events`**

In `Row` add `user_id: string`; in `Insert` add `user_id?: string`; in `Update` add `user_id?: string` (keep each block's fields alphabetical, so `user_id` goes after `template_id`).

- [ ] **Step 2: Add the counters to `templates`**

In `Row` add (alphabetical, so `last_used_at` goes between `image_width` and `name`, and the two counts go after `thumbnail_url`):

```ts
          last_used_at: string | null
          ...
          use_count_7d: number
          use_count_total: number
```

In `Insert` add `last_used_at?: string | null`, `use_count_7d?: number`, `use_count_total?: number`; in `Update` add the same three, all optional.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/database.ts
git commit -m "chore: add usage counter and event user_id columns to database types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `useTemplatesByUsage` reads the cached counter (TDD)

**Files:**
- Modify: `src/lib/queries/templates.test.tsx`
- Modify: `src/lib/queries/templates.ts`
- Delete: `src/lib/templateUsage.ts`, `src/lib/templateUsage.test.ts`

- [ ] **Step 1: Update the test mock and write the failing test**

In `src/lib/queries/templates.test.tsx`:

1. Delete the `mockUsageEvents` constant.
2. Add, next to `let lastUsageInsert: unknown`:

```ts
let lastTemplateOrders: Array<[string, unknown]> = []
let usageEventsSelected = false

// Awaitable, chainable stand-in for a Supabase `templates` query: `useTemplates` awaits
// `.select('*')` directly, `useTemplatesByUsage` chains `.order(...)` first.
function templatesQuery() {
  const query = {
    order: (column: string, options: unknown) => {
      lastTemplateOrders.push([column, options])
      return query
    },
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: mockTemplates, error: null }).then(resolve, reject),
  }
  return query
}
```

3. In the mock's `template_usage_events` branch, replace the `select` line with one that records misuse, and make the `templates` branch use the builder:

```ts
      if (table === 'template_usage_events') {
        return {
          select: () => {
            usageEventsSelected = true
            return Promise.resolve({ data: [], error: null })
          },
          insert: (values: unknown) => {
            lastUsageInsert = values
            return Promise.resolve({ error: null })
          },
        }
      }
      // templates
      return {
        select: () => templatesQuery(),
      }
```

4. Replace the `useTemplatesByUsage` describe block with:

```ts
describe('useTemplatesByUsage', () => {
  it('orders templates by the cached all-time counter, then name, without reading events', async () => {
    lastTemplateOrders = []
    usageEventsSelected = false
    const { result } = renderHook(() => useTemplatesByUsage(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastTemplateOrders).toEqual([
      ['use_count_total', { ascending: false }],
      ['name', { ascending: true }],
    ])
    expect(usageEventsSelected).toBe(false)
    expect(result.current.data).toEqual(mockTemplates)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/queries/templates.test.tsx`
Expected: the new `useTemplatesByUsage` test FAILS (`lastTemplateOrders` is `[]` and events were selected).

- [ ] **Step 3: Implement**

In `src/lib/queries/templates.ts`, delete the `import { sortTemplatesByUsage } ...` line and replace `useTemplatesByUsage` with:

```ts
export function useTemplatesByUsage() {
  return useQuery({
    queryKey: ['templates', 'by-usage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('use_count_total', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 4: Delete the old sort helper and its test**

```bash
git rm src/lib/templateUsage.ts src/lib/templateUsage.test.ts
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/lib/queries/templates.test.tsx && npx tsc -b`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/templates.ts src/lib/queries/templates.test.tsx
git commit -m "feat: sort templates by the cached usage counter instead of counting events in the browser

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Log clicks with the current user id (TDD)

**Files:**
- Modify: `src/lib/queries/templates.test.tsx`
- Modify: `src/lib/queries/templates.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/queries/templates.test.tsx` add the import `import { CURRENT_USER_ID } from '../currentUser'` and change the last assertion of the `useLogTemplateUsage` test to:

```ts
    expect(lastUsageInsert).toEqual({ template_id: 't1', user_id: CURRENT_USER_ID })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/queries/templates.test.tsx`
Expected: FAIL — inserted value has no `user_id`.

- [ ] **Step 3: Implement**

In `src/lib/queries/templates.ts` add `import { getCurrentUserId } from '../currentUser'` and change the insert:

```ts
      const { error } = await supabase
        .from('template_usage_events')
        .insert({ template_id: templateId, user_id: getCurrentUserId() })
```

- [ ] **Step 4: Run the full suite, typecheck, and lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: all PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/templates.ts src/lib/queries/templates.test.tsx
git commit -m "feat: record which user made each template click

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Pre-launch reset script

**Files:**
- Create: `supabase/maintenance/reset-template-usage.sql`

- [ ] **Step 1: Create the file**

```sql
-- Pre-launch reset of template usage data. NOT a migration — never runs automatically.
-- Run manually, only on the owner's explicit go-ahead, right before real users arrive:
-- everything logged before then is test data under the shared v1 user id.
--
-- Deletes every click event and zeroes the cached counters on templates.
delete from template_usage_events;

update templates
   set use_count_total = 0,
       use_count_7d    = 0,
       last_used_at    = null;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/maintenance/reset-template-usage.sql
git commit -m "docs: add manual pre-launch reset script for template usage data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Apply to production (REQUIRES the owner's explicit OK) and ship

- [ ] **Step 1: Ask the owner for an explicit OK to apply the migration to production.** Do not proceed on the plan's approval alone. State plainly: adds columns to `templates` and `template_usage_events`, a trigger, and installs the `pg_cron` extension.

- [ ] **Step 2: Apply the migration**

Run: `npm run db:push`
If the project isn't linked, use `mcp__supabase__apply_migration` with the same SQL and name `template_usage_counters`, then run `mcp__supabase__list_migrations` and rename the file's timestamp to the version the database recorded so the repo and database agree.

- [ ] **Step 3: Verify in production (read-only)**

Run via `execute_sql`:

```sql
select name, use_count_total, use_count_7d, last_used_at from templates order by use_count_total desc, name;
select jobname, schedule from cron.job;
select count(*) as events, count(distinct user_id) as distinct_users from template_usage_events;
```

Expected: counters match the historical event counts, the cron job `recompute-template-use-count-7d` at `0 * * * *` exists, `distinct_users` is `1`. Also run `mcp__supabase__get_advisors` (security) and report anything new.

- [ ] **Step 4: Regenerate types and confirm they match the hand edit**

Use `mcp__supabase__generate_typescript_types` and diff against `src/types/database.ts`; fix any difference in the hand-edited file and commit.

- [ ] **Step 5: Push the code to `main`** (only after Step 2 succeeded; ask first if unsure the owner wants it pushed now).

- [ ] **Step 6: Verify live.** Open the deployed site, confirm the sidebar order is unchanged, click a template, and confirm `use_count_total` for it went up by 1 in the database. **Do not use real save flows or leave fake rows** — this one click is real test usage that the pre-launch reset will wipe anyway.

- [ ] **Step 7: Update project memory** (`unified-builder-layout.md` / a new `template-usage-counters.md` + `MEMORY.md` index line): what shipped, the reset script path, that `user_id` is captured but every event is the shared v1 id until auth, and that the pre-launch wipe is still owed.
