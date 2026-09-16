# Unified Builder Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-state "pick a template, then see the canvas" flow with one continuous page: a left panel (most-used templates first, a Search All Memes modal for the rest) always beside the canvas, which starts blank instead of behind a full-page picker. Rename Start Over to Clear Canvas with a confirmation, and reuse that confirmation when switching templates mid-edit.

**Architecture:** New `template_usage_events` table + `templates.tags` column (migration). A pure `sortTemplatesByUsage` function backs a new `useTemplatesByUsage` query hook and a `useLogTemplateUsage` mutation. Three new components (`ConfirmDialog`, `TemplateSidebar`, `SearchTemplatesModal`) get wired into a restructured `EditorPage` that no longer early-returns to a separate empty-state page. `AppShell`'s shared width cap moves back to individual pages so the builder can use the full panel width.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, Supabase (Postgres + RLS), Tailwind v4.

---

### Task 1: Migration — `template_usage_events` table and `templates.tags` column

**Files:**
- Create: `supabase/migrations/20260916120000_template_usage_and_tags.sql`

- [ ] **Step 1: Write and apply the migration**

```sql
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
```

Apply via the Supabase MCP `apply_migration` tool (name: `template_usage_and_tags`). Per the project's known gotcha, rename this local file afterward to match whatever timestamp Supabase actually recorded (`list_migrations` to check), if it differs from `20260916120000`.

- [ ] **Step 2: Verify**

Run `execute_sql`: `select column_name from information_schema.columns where table_name = 'templates' and column_name = 'tags';` — expect one row. Run `select tags from templates where name = 'Two Buttons';` — expect `{reaction,decision}`. Run `select * from template_usage_events limit 1;` — expect an empty result with no error (table exists, RLS doesn't block a select).

Run `get_advisors` (security) — expect clean, matching the rest of the schema.

- [ ] **Step 3: Regenerate TypeScript types**

Run the Supabase MCP `generate_typescript_types` tool and overwrite `src/types/database.ts` with the result. Confirm `Tables<'template_usage_events'>` and `Tables<'templates'>['tags']` now exist by grepping the regenerated file.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260916120000_template_usage_and_tags.sql src/types/database.ts
git commit -m "feat: add template_usage_events table and templates.tags column"
```

---

### Task 2: Pure usage-sorting logic

**Files:**
- Create: `src/lib/templateUsage.ts`
- Test: `src/lib/templateUsage.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/templateUsage.test.ts
import { describe, it, expect } from 'vitest'
import { sortTemplatesByUsage } from './templateUsage'

const templates = [
  { id: 't1', name: 'Two Buttons' },
  { id: 't2', name: 'Drake' },
  { id: 't3', name: 'Distracted Boyfriend' },
]

describe('sortTemplatesByUsage', () => {
  it('sorts templates by descending usage event count', () => {
    const usageEvents = [
      { template_id: 't2' },
      { template_id: 't2' },
      { template_id: 't2' },
      { template_id: 't1' },
    ]
    const sorted = sortTemplatesByUsage(templates, usageEvents)
    expect(sorted.map((t) => t.id)).toEqual(['t2', 't1', 't3'])
  })

  it('breaks ties alphabetically by name', () => {
    const usageEvents = [{ template_id: 't1' }, { template_id: 't3' }]
    const sorted = sortTemplatesByUsage(templates, usageEvents)
    // t1 (Two Buttons) and t3 (Distracted Boyfriend) are tied at 1 use each —
    // Distracted Boyfriend sorts first alphabetically. t2 (Drake, 0 uses) is last.
    expect(sorted.map((t) => t.id)).toEqual(['t3', 't1', 't2'])
  })

  it('templates with no usage events at all sort last, alphabetically among themselves', () => {
    const sorted = sortTemplatesByUsage(templates, [])
    expect(sorted.map((t) => t.id)).toEqual(['t3', 't2', 't1']) // Distracted Boyfriend, Drake, Two Buttons
  })

  it('returns an empty array for no templates', () => {
    expect(sortTemplatesByUsage([], [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- templateUsage`
Expected: FAIL — `src/lib/templateUsage.ts` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/lib/templateUsage.ts
interface TemplateLike {
  id: string
  name: string
}

interface UsageEventLike {
  template_id: string
}

export function sortTemplatesByUsage<T extends TemplateLike>(templates: T[], usageEvents: UsageEventLike[]): T[] {
  const counts = new Map<string, number>()
  for (const event of usageEvents) {
    counts.set(event.template_id, (counts.get(event.template_id) ?? 0) + 1)
  }
  return [...templates].sort((a, b) => {
    const countDiff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    if (countDiff !== 0) return countDiff
    return a.name.localeCompare(b.name)
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- templateUsage`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/templateUsage.ts src/lib/templateUsage.test.ts
git commit -m "feat: add pure most-used-templates sorting logic"
```

---

### Task 3: Query hooks — fetch by usage, log a usage event

**Files:**
- Modify: `src/lib/queries/templates.ts`
- Modify: `src/lib/queries/templates.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/queries/templates.test.tsx` entirely:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTemplates, useTemplateFields, useTemplatesByUsage, useLogTemplateUsage } from './templates'

const mockFields = [
  { id: 'f1', template_id: 'tmpl-1', label: 'Caption 1', order_index: 0 },
  { id: 'f2', template_id: 'tmpl-1', label: 'Caption 2', order_index: 1 },
]
const mockTemplates = [
  { id: 't1', name: 'Two Buttons' },
  { id: 't2', name: 'Drake' },
]
const mockUsageEvents = [{ template_id: 't2' }, { template_id: 't2' }]

let lastUsageInsert: unknown

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'template_fields') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: mockFields, error: null }),
            }),
          }),
        }
      }
      if (table === 'template_usage_events') {
        return {
          select: () => Promise.resolve({ data: mockUsageEvents, error: null }),
          insert: (values: unknown) => {
            lastUsageInsert = values
            return Promise.resolve({ error: null })
          },
        }
      }
      // templates
      return {
        select: () => Promise.resolve({ data: mockTemplates, error: null }),
      }
    },
  },
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useTemplates', () => {
  it('returns the list of templates from Supabase', async () => {
    const { result } = renderHook(() => useTemplates(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockTemplates)
  })
})

describe('useTemplateFields', () => {
  it('returns the ordered fields for a template', async () => {
    const { result } = renderHook(() => useTemplateFields('tmpl-1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockFields)
  })

  it('does not fetch when templateId is undefined', () => {
    const { result } = renderHook(() => useTemplateFields(undefined), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })
})

describe('useTemplatesByUsage', () => {
  it('returns templates sorted by usage event count descending', async () => {
    const { result } = renderHook(() => useTemplatesByUsage(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((t) => t.id)).toEqual(['t2', 't1'])
  })
})

describe('useLogTemplateUsage', () => {
  it('inserts a usage event for the given template id', async () => {
    const { result } = renderHook(() => useLogTemplateUsage(), { wrapper })
    result.current.mutate('t1')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUsageInsert).toMatchObject({ template_id: 't1' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- templates`
Expected: FAIL — `useTemplatesByUsage` and `useLogTemplateUsage` are not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/queries/templates.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import { sortTemplatesByUsage } from '../templateUsage'
```

(Merge with the existing `import { useQuery } from '@tanstack/react-query'` line — becomes the three-name import above, plus `useQueryClient`.)

```ts
export function useTemplatesByUsage() {
  return useQuery({
    queryKey: ['templates', 'by-usage'],
    queryFn: async () => {
      const [templatesRes, usageRes] = await Promise.all([
        supabase.from('templates').select('*'),
        supabase.from('template_usage_events').select('template_id'),
      ])
      if (templatesRes.error) throw templatesRes.error
      if (usageRes.error) throw usageRes.error
      return sortTemplatesByUsage(templatesRes.data, usageRes.data)
    },
  })
}

export function useLogTemplateUsage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.from('template_usage_events').insert({ template_id: templateId })
      if (error) throw error
    },
    onSuccess: () => {
      // Invalidate so the next time the sidebar/most-used list is read, it
      // reflects this click — not required to feel instant (nobody is
      // staring at their own click reordering the list), just eventually
      // consistent.
      queryClient.invalidateQueries({ queryKey: ['templates', 'by-usage'] })
    },
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- templates`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/templates.ts src/lib/queries/templates.test.tsx
git commit -m "feat: add useTemplatesByUsage and useLogTemplateUsage query hooks"
```

---

### Task 4: `ConfirmDialog` — generic reusable confirmation modal

**Files:**
- Create: `src/components/ui/ConfirmDialog.tsx`
- Test: `src/components/ui/ConfirmDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/ui/ConfirmDialog.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog
        open={false}
        title="Clear canvas?"
        message="This will discard your current work."
        confirmLabel="Clear"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the title, message, and confirm label when open', () => {
    render(
      <ConfirmDialog
        open
        title="Clear canvas?"
        message="This will discard your current work."
        confirmLabel="Clear"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Clear canvas?')).toBeInTheDocument()
    expect(screen.getByText('This will discard your current work.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog open title="T" message="M" confirmLabel="Do it" onConfirm={onConfirm} onCancel={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('calls onCancel when the cancel button is clicked', async () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog open title="T" message="M" confirmLabel="Do it" onConfirm={vi.fn()} onCancel={onCancel} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- ConfirmDialog`
Expected: FAIL — `src/components/ui/ConfirmDialog.tsx` does not exist yet.

- [ ] **Step 3: Implement**

```tsx
// src/components/ui/ConfirmDialog.tsx
import { Button } from './button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div role="dialog" className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-lg bg-background p-4 shadow-lg">
        <h2 className="mb-2 text-sm font-semibold">{title}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- ConfirmDialog`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ConfirmDialog.tsx src/components/ui/ConfirmDialog.test.tsx
git commit -m "feat: add generic ConfirmDialog component"
```

---

### Task 5: `TemplateSidebar` — vertical most-used list + Search All Memes button

**Files:**
- Create: `src/features/editor/TemplateSidebar.tsx`
- Test: `src/features/editor/TemplateSidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/editor/TemplateSidebar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TemplateSidebar } from './TemplateSidebar'

const mockTemplates = [
  { id: 't1', name: 'Two Buttons', blank_image_url: 'https://example.com/two-buttons.jpg', image_width: 600, image_height: 908 },
  { id: 't2', name: 'Drake', blank_image_url: 'https://example.com/drake.jpg', image_width: 500, image_height: 500 },
]
// Two clicks on Drake, none on Two Buttons — Drake should render first.
const mockUsageEvents = [{ template_id: 't2' }, { template_id: 't2' }]

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'template_usage_events') {
        return {
          select: () => Promise.resolve({ data: mockUsageEvents, error: null }),
          insert: () => Promise.resolve({ error: null }),
        }
      }
      return { select: () => Promise.resolve({ data: mockTemplates, error: null }) }
    },
  },
}))

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('TemplateSidebar', () => {
  it('renders templates most-used first', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
    const names = (await screen.findAllByRole('button', { name: /Two Buttons|Drake/ })).map((el) => el.textContent)
    expect(names).toEqual(['Drake', 'Two Buttons'])
  })

  it('calls onSelectTemplate with the real template row when a row is clicked', async () => {
    const onSelectTemplate = vi.fn()
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={onSelectTemplate} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Two Buttons' }))

    expect(onSelectTemplate).toHaveBeenCalledWith({
      id: 't1',
      name: 'Two Buttons',
      blankImageUrl: 'https://example.com/two-buttons.jpg',
      imageWidth: 600,
      imageHeight: 908,
    })
  })

  it('opens the search modal when Search All Memes is clicked', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Search All Memes' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- TemplateSidebar`
Expected: FAIL — `src/features/editor/TemplateSidebar.tsx` does not exist yet.

- [ ] **Step 3: Implement**

```tsx
// src/features/editor/TemplateSidebar.tsx
import { useState } from 'react'
import { useTemplatesByUsage, useLogTemplateUsage } from '../../lib/queries/templates'
import { SearchTemplatesModal } from './SearchTemplatesModal'

export interface SelectedTemplate {
  id: string
  name: string
  blankImageUrl: string
  imageWidth: number
  imageHeight: number
}

export interface TemplateSidebarProps {
  selectedTemplateId: string | undefined
  onSelectTemplate: (template: SelectedTemplate) => void
}

export function TemplateSidebar({ selectedTemplateId, onSelectTemplate }: TemplateSidebarProps) {
  const { data: templates = [] } = useTemplatesByUsage()
  const logUsage = useLogTemplateUsage()
  const [searchOpen, setSearchOpen] = useState(false)

  function pick(t: { id: string; name: string; blank_image_url: string; image_width: number; image_height: number }) {
    logUsage.mutate(t.id)
    onSelectTemplate({ id: t.id, name: t.name, blankImageUrl: t.blank_image_url, imageWidth: t.image_width, imageHeight: t.image_height })
  }

  return (
    <div className="flex h-full w-56 shrink-0 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t)}
            className={`flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm ${
              selectedTemplateId === t.id ? 'bg-muted' : 'hover:bg-muted'
            }`}
          >
            <span
              className="h-10 w-10 shrink-0 rounded bg-muted bg-cover bg-center"
              style={{ backgroundImage: `url(${t.blank_image_url})` }}
            />
            {t.name}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="mt-2 w-full rounded-md border border-border p-2 text-sm font-medium hover:bg-muted"
      >
        Search All Memes
      </button>

      <SearchTemplatesModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectTemplate={(t) => {
          pick({ id: t.id, name: t.name, blank_image_url: t.blankImageUrl, image_width: t.imageWidth, image_height: t.imageHeight })
          setSearchOpen(false)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- TemplateSidebar`
Expected: FAIL — `SearchTemplatesModal` doesn't exist yet either. This is expected; Task 6 adds it. Note the failure and move on.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/TemplateSidebar.tsx src/features/editor/TemplateSidebar.test.tsx
git commit -m "feat: add TemplateSidebar (WIP, depends on SearchTemplatesModal)"
```

---

### Task 6: `SearchTemplatesModal` — search-by-name over all templates

**Files:**
- Create: `src/features/editor/SearchTemplatesModal.tsx`
- Test: `src/features/editor/SearchTemplatesModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/editor/SearchTemplatesModal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SearchTemplatesModal } from './SearchTemplatesModal'

const mockTemplates = [
  { id: 't1', name: 'Two Buttons', blank_image_url: 'https://example.com/two-buttons.jpg', image_width: 600, image_height: 908 },
  { id: 't2', name: 'Drake', blank_image_url: 'https://example.com/drake.jpg', image_width: 500, image_height: 500 },
]

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: mockTemplates, error: null }) }) },
}))

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('SearchTemplatesModal', () => {
  it('renders nothing when closed', () => {
    renderWithQuery(<SearchTemplatesModal open={false} onClose={vi.fn()} onSelectTemplate={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows all templates by default, filters by search text', async () => {
    renderWithQuery(<SearchTemplatesModal open onClose={vi.fn()} onSelectTemplate={vi.fn()} />)

    expect(await screen.findByText('Two Buttons')).toBeInTheDocument()
    expect(screen.getByText('Drake')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/search/i), 'drake')

    expect(screen.queryByText('Two Buttons')).not.toBeInTheDocument()
    expect(screen.getByText('Drake')).toBeInTheDocument()
  })

  it('calls onSelectTemplate with the real template row when a tile is clicked', async () => {
    const onSelectTemplate = vi.fn()
    renderWithQuery(<SearchTemplatesModal open onClose={vi.fn()} onSelectTemplate={onSelectTemplate} />)

    await userEvent.click(await screen.findByText('Two Buttons'))

    expect(onSelectTemplate).toHaveBeenCalledWith({
      id: 't1',
      name: 'Two Buttons',
      blankImageUrl: 'https://example.com/two-buttons.jpg',
      imageWidth: 600,
      imageHeight: 908,
    })
  })

  it('calls onClose when the backdrop close button is clicked', async () => {
    const onClose = vi.fn()
    renderWithQuery(<SearchTemplatesModal open onClose={onClose} onSelectTemplate={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- SearchTemplatesModal`
Expected: FAIL — `src/features/editor/SearchTemplatesModal.tsx` does not exist yet.

- [ ] **Step 3: Implement**

```tsx
// src/features/editor/SearchTemplatesModal.tsx
import { useState } from 'react'
import { useTemplates } from '../../lib/queries/templates'
import type { SelectedTemplate } from './TemplateSidebar'

export interface SearchTemplatesModalProps {
  open: boolean
  onClose: () => void
  onSelectTemplate: (template: SelectedTemplate) => void
}

export function SearchTemplatesModal({ open, onClose, onSelectTemplate }: SearchTemplatesModalProps) {
  const { data: templates = [] } = useTemplates()
  const [search, setSearch] = useState('')

  if (!open) return null

  const filtered = templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div role="dialog" className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="flex max-h-[80vh] w-[36rem] max-w-[90vw] flex-col rounded-lg bg-background p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-2">
          <input
            type="text"
            placeholder="Search all memes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-md border border-border px-2 py-1.5 text-sm"
          />
          <button type="button" aria-label="Close" onClick={onClose} className="px-2 text-sm text-muted-foreground">
            ✕
          </button>
        </div>

        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No templates match "{search}".</p>}

        <div className="grid grid-cols-4 gap-2.5 overflow-y-auto">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() =>
                onSelectTemplate({
                  id: t.id,
                  name: t.name,
                  blankImageUrl: t.blank_image_url,
                  imageWidth: t.image_width,
                  imageHeight: t.image_height,
                })
              }
              className="flex aspect-square items-end overflow-hidden rounded-md bg-muted bg-cover bg-center p-1.5 text-left text-xs font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0_/_0.8)]"
              style={{ backgroundImage: `url(${t.blank_image_url})` }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- SearchTemplatesModal`
Expected: PASS (4 tests)

- [ ] **Step 5: Run TemplateSidebar's tests again — they depended on this file**

Run: `npm run test -- TemplateSidebar`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/SearchTemplatesModal.tsx src/features/editor/SearchTemplatesModal.test.tsx
git commit -m "feat: add SearchTemplatesModal"
```

---

### Task 7: `AppShell` / `GalleryPage` — move the width cap back to individual pages

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/features/gallery/GalleryPage.tsx`

- [ ] **Step 1: Update `AppShell`**

In `src/components/layout/AppShell.tsx`, replace the `<main>` block:

```tsx
      <main className="mx-4 mb-4 flex-1 rounded-2xl bg-background shadow-[0_14px_32px_-10px_rgba(15,23,42,0.25)] sm:mx-8 sm:mb-8">
        {/* Shared here, not per-page — every routed page's heading/content
            lands at this same left position and width regardless of which
            page it is, so switching the header toggle never shifts it.
            Left-aligned (no mx-auto) rather than centered as a narrow column. */}
        <div className="max-w-2xl p-8">
          <Outlet />
        </div>
      </main>
```

with:

```tsx
      <main className="mx-4 mb-4 flex-1 rounded-2xl bg-background shadow-[0_14px_32px_-10px_rgba(15,23,42,0.25)] sm:mx-8 sm:mb-8">
        {/* p-8 (not also max-w-2xl) is what's shared across every page now —
            that's what keeps the left-edge position consistent when
            switching the header toggle, which is all the earlier fix for
            this was actually about. Width is each page's own decision again:
            Gallery keeps a centered max-w-2xl column, the builder page needs
            the full available width for its sidebar+canvas layout. flex
            flex-col h-full lets a page opt into filling all remaining
            height (flex-1 on its own root) without forcing that on pages
            that don't need it. */}
        <div className="flex h-full flex-col p-8">
          <Outlet />
        </div>
      </main>
```

- [ ] **Step 2: Update `GalleryPage`**

In `src/features/gallery/GalleryPage.tsx`, change the root `<section>`:

```tsx
    <section>
```

to:

```tsx
    <section className="max-w-2xl">
```

- [ ] **Step 3: Run the full suite, build, lint**

Run: `npm run test && npm run build && npm run lint`
Expected: all pass — this is a pure layout change, no behavior affected. (`EditorPage` doesn't yet use the new full-height flex context; that lands in Task 8.)

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppShell.tsx src/features/gallery/GalleryPage.tsx
git commit -m "fix: move the page width cap from AppShell back to individual pages"
```

---

### Task 8: Wire `TemplateSidebar` + `ConfirmDialog` into `EditorPage`; delete `EditorEmptyState`

This is the big integration task. `EditorPage` stops early-returning to `EditorEmptyState` when `!source` — it now always renders the two-pane layout, with the canvas area showing just the checkerboard background (no image, no fields) when nothing is picked yet.

**Files:**
- Modify: `src/features/editor/EditorPage.tsx`
- Modify: `src/features/editor/EditorPage.test.tsx`
- Delete: `src/features/editor/EditorEmptyState.tsx`
- Delete: `src/features/editor/EditorEmptyState.test.tsx`

- [ ] **Step 1: Update the test mock and rewrite the first test**

In `src/features/editor/EditorPage.test.tsx`, add `template_usage_events` handling to the existing supabase mock:

```ts
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'templates') {
        return { select: () => Promise.resolve({ data: [mockTemplate], error: null }) }
      }
      if (table === 'template_fields') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: mockFields, error: null }),
            }),
          }),
        }
      }
      if (table === 'template_usage_events') {
        return {
          select: () => Promise.resolve({ data: [], error: null }),
          insert: () => Promise.resolve({ error: null }),
        }
      }
      // creations
      return {
        select: () => ({
          order: () => Promise.resolve({ data: savedRows, error: null }),
          eq: (_col: string, id: string) => ({
            single: () => {
              const row = savedRows.find((r) => r.id === id)
              return Promise.resolve({ data: row ?? null, error: row ? null : { message: 'not found' } })
            },
          }),
        }),
        insert: (values: { name: string; tags: string[]; source_type: string; template_id: string | null }) => ({
          select: () => ({
            single: () => {
              const row = { id: String(nextId++), ...values }
              savedRows.push(row)
              return Promise.resolve({ data: row, error: null })
            },
          }),
        }),
        update: (values: { name: string; tags: string[] }) => ({
          eq: (_col: string, id: string) => ({
            select: () => ({
              single: () => {
                const row = savedRows.find((r) => r.id === id)!
                Object.assign(row, values)
                return Promise.resolve({ data: row, error: null })
              },
            }),
          }),
        }),
      }
    },
  },
}))
```

Replace the first test (it currently checks for the old full-page empty state):

```ts
  it('shows a blank canvas and the template sidebar first, then the real template image and its fields after picking it', async () => {
    renderEditor()
    expect(await screen.findByRole('button', { name: 'Two Buttons' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Two Buttons' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Two Buttons' }))

    expect(screen.getByRole('img', { name: 'Two Buttons' })).toHaveAttribute('src', 'https://example.com/blank.jpg')
    expect(screen.getByText('Caption 1')).toBeInTheDocument()
    expect(screen.getByText('Caption 2')).toBeInTheDocument()
    expect(screen.getByText('Caption 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Text' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })
```

Every other existing test that does `await userEvent.click(await screen.findByText('Two Buttons'))` to pick the template still works unchanged — that text now lives in the always-visible sidebar instead of a full-page grid, but it's still a click on text reading "Two Buttons" that selects the template. Leave those as-is.

- [ ] **Step 2: Add new tests for Clear Canvas, template-switch confirmation, and usage logging**

Add at the end of the `describe('EditorPage', ...)` block:

```ts
  it('does not show a Clear Canvas button when the canvas is blank', async () => {
    renderEditor()
    await screen.findByRole('button', { name: 'Two Buttons' }) // wait for sidebar to load
    expect(screen.queryByRole('button', { name: 'Clear Canvas' })).not.toBeInTheDocument()
  })

  it('Clear Canvas asks for confirmation, and only clears once confirmed', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear Canvas' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument() // not cleared yet

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear Canvas' }))
    expect(screen.queryByRole('img', { name: 'Two Buttons' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear Canvas' })).not.toBeInTheDocument()
  })

  it('Clear Canvas cancel leaves the canvas untouched', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))

    await userEvent.click(screen.getByRole('button', { name: 'Clear Canvas' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
  })

  it('picking a template while the canvas is blank loads it with no confirmation', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Two Buttons' })).toBeInTheDocument()
  })
```

Note: with only one seeded template in this mock, "picking a different template while one is loaded" can't be exercised end-to-end here (there's nothing else to pick). Cover that branch at the unit level instead — see Step 3.

- [ ] **Step 3: Delete `EditorEmptyState` and its test**

```bash
git rm src/features/editor/EditorEmptyState.tsx src/features/editor/EditorEmptyState.test.tsx
```

- [ ] **Step 4: Run the tests to verify the expected failures**

Run: `npm run test -- EditorPage`
Expected: FAIL — `EditorPage` still imports the deleted `EditorEmptyState`, still early-returns on `!source`, still says "Start Over", has no Clear Canvas confirmation.

- [ ] **Step 5: Implement — imports, state, and the confirm-aware select handler**

In `src/features/editor/EditorPage.tsx`, replace the imports:

```ts
import { Fragment, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { TemplateSidebar } from './TemplateSidebar'
import type { SelectedTemplate } from './TemplateSidebar'
import { PropertyBar } from './PropertyBar'
import { SaveDialog } from './SaveDialog'
import { useCreation, useCreateCreation, useCreations, useUpdateCreation } from '../../lib/queries/creations'
import { useTemplates, useTemplateFields } from '../../lib/queries/templates'
import { nextAvailableName } from '../../lib/creationNaming'
import { layersFromCanvasData, applyDragDelta, applyResizeDelta } from '../../lib/layers'
import type { Layer, ResizeSign } from '../../lib/layers'
import type { Json } from '../../types/database'
```

Add a `pendingTemplate` state and `clearConfirmOpen` state alongside the existing ones:

```ts
  const [source, setSource] = useState<Source>(null)
  const [savedMeta, setSavedMeta] = useState<SavedMeta>(null)
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const editStartLabel = useRef('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'save' | 'saveAs'>('save')
  const [dialogKey, setDialogKey] = useState(0)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<SelectedTemplate | null>(null)
```

- [ ] **Step 6: Implement — remove the `!source` early return, restructure `startOver` into `clearCanvas`, add the template-select and confirm handlers**

Remove this block entirely (it currently sits right after the `if (creationId && loadingExisting)` early return):

```tsx
  if (!source) {
    return (
      <EditorEmptyState
        onUpload={() => setSource({ type: 'freeform', name: 'My Meme' })}
        onSelectTemplate={(template: SelectedTemplate) =>
          setSource({
            type: 'template',
            name: template.name,
            templateId: template.id,
            blankImageUrl: template.blankImageUrl,
          })
        }
      />
    )
  }
```

`templateRow` currently reads `source.type === 'template' ? ... : undefined` and is computed right after that removed block — it needs a null-safe form now that `source` can be `null` at this point in the function body:

```ts
  const templateRow = source?.type === 'template' ? allTemplates.find((t) => t.id === source.templateId) : undefined
```

Replace `startOver` with `clearCanvas` (same body, renamed, now called only after confirmation) and add the select/confirm handlers:

```ts
  function clearCanvas() {
    setSource(null)
    setSavedMeta(null)
    setSelectedFieldId(null)
    setEditingLayerId(null)
    setLayers([])
    setLayersSeededFor(undefined)
    if (creationId) navigate('/')
  }

  function loadTemplate(template: SelectedTemplate) {
    setSource({ type: 'template', name: template.name, templateId: template.id, blankImageUrl: template.blankImageUrl })
    setSavedMeta(null)
    setSelectedFieldId(null)
    setEditingLayerId(null)
    setLayers([])
    setLayersSeededFor(undefined)
    if (creationId) navigate('/')
  }

  function handleSelectTemplate(template: SelectedTemplate) {
    if (source !== null) {
      setPendingTemplate(template)
    } else {
      loadTemplate(template)
    }
  }

  function handleClearCanvasClick() {
    setClearConfirmOpen(true)
  }

  function confirmClearCanvas() {
    clearCanvas()
    setClearConfirmOpen(false)
  }

  function confirmSwitchTemplate() {
    if (pendingTemplate) loadTemplate(pendingTemplate)
    setPendingTemplate(null)
  }
```

Every other function that referenced `source.name` / `source.type` etc. below this point already only runs once `source` is guaranteed non-null in practice (the `defaultName` line, `handleDialogSave`) — but TypeScript no longer knows that from an early return. Guard `defaultName`:

```ts
  const defaultName =
    dialogMode === 'saveAs' && savedMeta
      ? `${savedMeta.name} copy`
      : nextAvailableName(source?.name ?? '', allCreations.map((c) => c.name))
```

- [ ] **Step 7: Implement — the two-pane render**

Replace the `return (...)` block. The toolbar row's "← Start Over" button becomes a conditionally-rendered "Clear Canvas" button; the canvas wrapper gains the checkerboard-when-blank behavior; the whole thing gets wrapped in a flex row with `TemplateSidebar`:

```tsx
  return (
    <div className="flex h-full gap-6">
      <TemplateSidebar selectedTemplateId={source?.type === 'template' ? source.templateId : undefined} onSelectTemplate={handleSelectTemplate} />

      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="mb-3 text-lg font-semibold">{savedMeta ? savedMeta.name : 'Editor'}</h2>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-1.5">
          {source !== null ? (
            <Button size="sm" variant="outline" onClick={handleClearCanvasClick}>
              Clear Canvas
            </Button>
          ) : (
            <div />
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" disabled>
              + Text
            </Button>
            <Button size="sm" variant="outline" disabled>
              + Sticker
            </Button>
            <Button size="sm" variant="outline" disabled>
              Export
            </Button>

            {source !== null && !savedMeta && (
              <Button size="sm" onClick={() => openDialog('save')}>
                Save to Gallery
              </Button>
            )}
            {savedMeta && (
              <div className="flex">
                <Button size="sm" className="rounded-r-none" onClick={handleQuickSave}>
                  Save
                </Button>
                <Button
                  size="sm"
                  aria-label="▾"
                  className="rounded-l-none border-l border-primary-foreground/30 px-2"
                  onClick={() => openDialog('saveAs')}
                >
                  ▾
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-1 items-start justify-center overflow-auto">
          <div className="relative inline-block rounded-lg bg-[repeating-conic-gradient(#00000010_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
            {source === null && <div className="h-80 w-80" /* blank canvas — just the checkerboard background */ />}
            {source?.type === 'template' ? (
              <img
                ref={imgRef}
                src={source.blankImageUrl}
                alt={source.name}
                className="block max-h-[65vh] w-auto max-w-full"
              />
            ) : null}
            {source?.type === 'freeform' && (
              <div className="flex h-80 w-80 items-center justify-center border border-border bg-muted text-sm text-muted-foreground">
                {source.name}
              </div>
            )}

            {source?.type === 'template' && templateRow && (
              // Unchanged from the current implementation below this line
              // through the closing </div> — only its container above
              // changed in this task. Copy verbatim, don't retype from
              // memory: the drag/resize/edit-mode logic here is exact and
              // easy to introduce a subtle regression into by hand.
              <div className="absolute inset-0 @container">
                {layers.map((layer) => {
                  const leftPct = (layer.x / templateRow.image_width) * 100
                  const topPct = (layer.y / templateRow.image_height) * 100
                  const widthPct = (layer.width / templateRow.image_width) * 100
                  const heightPct = (layer.height / templateRow.image_height) * 100
                  const fontSizeCqw = (layer.fontSize / templateRow.image_width) * 100

                  const isSelected = selectedFieldId === layer.id
                  const isEditing = editingLayerId === layer.id

                  return (
                    <Fragment key={layer.id}>
                      <div
                        key={isEditing ? `${layer.id}-edit` : `${layer.id}-view`}
                        className={`absolute p-1 text-center font-bold text-black outline-none ${
                          isSelected ? 'border border-blue-500' : 'border border-transparent'
                        } ${isEditing ? 'cursor-text' : 'cursor-grab touch-none active:cursor-grabbing'} ${
                          isSelected && !isEditing ? 'hover:underline hover:decoration-blue-500' : ''
                        }`}
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: `${widthPct}%`,
                          ...(layer.heightAuto ? {} : { height: `${heightPct}%` }),
                          fontSize: `calc(${fontSizeCqw} * 1cqw)`,
                        }}
                        contentEditable={isEditing}
                        suppressContentEditableWarning
                        ref={
                          isEditing
                            ? (el) => {
                                if (el && el.textContent !== layer.label) {
                                  el.textContent = layer.label
                                  el.focus()
                                  try {
                                    const range = document.createRange()
                                    range.selectNodeContents(el)
                                    const selection = window.getSelection()
                                    selection?.removeAllRanges()
                                    selection?.addRange(range)
                                  } catch {
                                    // ignore — select-all-on-edit is a convenience, not a requirement
                                  }
                                }
                              }
                            : undefined
                        }
                        onPointerDown={(e) => handlePointerDown(e, layer)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => handleDoubleClick(e, layer)}
                        onInput={(e) => handleLabelInput(layer.id, e.currentTarget.textContent ?? '')}
                        onBlur={handleLabelBlur}
                        onKeyDown={(e) => handleLabelKeyDown(e, layer.id)}
                      >
                        {!isEditing && layer.label}
                        {isSelected &&
                          !isEditing &&
                          RESIZE_HANDLES.map((handle) => (
                            <div
                              key={handle.key}
                              className="absolute h-2.5 w-2.5 touch-none border border-blue-500 bg-white"
                              style={{ top: handle.top, left: handle.left, transform: 'translate(-50%, -50%)', cursor: handle.cursor }}
                              onPointerDown={(e) => handleResizePointerDown(e, layer, handle.xSign, handle.ySign)}
                              onPointerMove={handleResizePointerMove}
                              onPointerUp={handleResizePointerUp}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ))}
                      </div>

                      {isSelected && (
                        <div
                          className="absolute"
                          style={{
                            left: `${leftPct + widthPct / 2}%`,
                            top: `${topPct}%`,
                            transform: 'translate(-50%, calc(-100% - 8px))',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <PropertyBar
                            fontSize={layer.fontSize}
                            onChangeFontSize={(px) => handleChangeFontSize(layer.id, px)}
                            onDelete={() => handleDeleteLayer(layer.id)}
                          />
                        </div>
                      )}
                    </Fragment>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <SaveDialog
        key={dialogKey}
        open={dialogOpen}
        title={dialogMode === 'saveAs' ? 'Save As — My Creations' : 'Save to My Creations'}
        defaultName={defaultName}
        defaultTags={defaultTags}
        existingCreations={allCreations}
        onCancel={() => setDialogOpen(false)}
        onSave={handleDialogSave}
      />

      <ConfirmDialog
        open={clearConfirmOpen}
        title="Clear canvas?"
        message="This will discard your current work. This can't be undone."
        confirmLabel="Clear Canvas"
        onConfirm={confirmClearCanvas}
        onCancel={() => setClearConfirmOpen(false)}
      />

      <ConfirmDialog
        open={pendingTemplate !== null}
        title="Switch templates?"
        message="This will discard your current work. This can't be undone."
        confirmLabel="Switch Template"
        onConfirm={confirmSwitchTemplate}
        onCancel={() => setPendingTemplate(null)}
      />
    </div>
  )
}
```

Two behavior notes worth calling out precisely, since they're easy to get subtly wrong:
- `defaultTags` (just above `handleDialogSave` in the existing file) already reads `dialogMode === 'saveAs' && savedMeta ? savedMeta.tags : []` — no `source` access, no change needed there.
- The outer wrapper's deselect-on-click-anywhere `useEffect` (document-level listener) and the `if (creationId && loadingExisting)` loading-state early return both stay exactly where they are, above all of this — they don't depend on `source`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test -- EditorPage`
Expected: PASS (all cases, including the new Clear Canvas / confirmation ones)

- [ ] **Step 9: Run the full suite, build, lint**

Run: `npm run test && npm run build && npm run lint`
Expected: all clean.

- [ ] **Step 10: Commit**

```bash
git add src/features/editor/EditorPage.tsx src/features/editor/EditorPage.test.tsx
git rm src/features/editor/EditorEmptyState.tsx src/features/editor/EditorEmptyState.test.tsx
git commit -m "feat: unify the template picker and canvas into one page"
```

---

### Task 9: Mobile collapsible drawer for `TemplateSidebar`

**Files:**
- Modify: `src/features/editor/TemplateSidebar.tsx`
- Modify: `src/features/editor/TemplateSidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/features/editor/TemplateSidebar.test.tsx`:

```ts
  it('is collapsed by default and expands into a drawer when its toggle is clicked', async () => {
    renderWithQuery(<TemplateSidebar selectedTemplateId={undefined} onSelectTemplate={vi.fn()} />)

    // The template list isn't visible until the drawer is opened, on narrow
    // viewports — but jsdom doesn't do real layout/media queries, so this
    // asserts the drawer's own open/closed state via its toggle button
    // rather than actual visibility, which is verified live in the browser
    // (see the plan's final task).
    const toggle = await screen.findByRole('button', { name: /templates/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- TemplateSidebar`
Expected: FAIL — no toggle button with an accessible name matching "templates" exists yet.

- [ ] **Step 3: Implement**

Replace `src/features/editor/TemplateSidebar.tsx`'s return statement:

```tsx
export function TemplateSidebar({ selectedTemplateId, onSelectTemplate }: TemplateSidebarProps) {
  const { data: templates = [] } = useTemplatesByUsage()
  const logUsage = useLogTemplateUsage()
  const [searchOpen, setSearchOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  function pick(t: { id: string; name: string; blank_image_url: string; image_width: number; image_height: number }) {
    logUsage.mutate(t.id)
    onSelectTemplate({ id: t.id, name: t.name, blankImageUrl: t.blank_image_url, imageWidth: t.image_width, imageHeight: t.image_height })
    setDrawerOpen(false)
  }

  const listContent = (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t)}
            className={`flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm ${
              selectedTemplateId === t.id ? 'bg-muted' : 'hover:bg-muted'
            }`}
          >
            <span
              className="h-10 w-10 shrink-0 rounded bg-muted bg-cover bg-center"
              style={{ backgroundImage: `url(${t.blank_image_url})` }}
            />
            {t.name}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="mt-2 w-full rounded-md border border-border p-2 text-sm font-medium hover:bg-muted"
      >
        Search All Memes
      </button>
    </>
  )

  return (
    <>
      {/* Mobile: a toggle that expands the list as a slide-out overlay
          instead of permanently occupying layout width. Desktop keeps the
          permanent column; both render the same listContent underneath. */}
      <button
        type="button"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((open) => !open)}
        className="mb-2 w-full rounded-md border border-border p-2 text-left text-sm font-medium sm:hidden"
      >
        {drawerOpen ? '✕ Close Templates' : '☰ Templates'}
      </button>
      {drawerOpen && (
        <div className="fixed inset-0 z-10 flex sm:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="relative flex h-full w-64 flex-col bg-background p-3 shadow-lg">{listContent}</div>
        </div>
      )}

      <div className="hidden h-full w-56 shrink-0 flex-col sm:flex">{listContent}</div>

      <SearchTemplatesModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectTemplate={(t) => {
          pick({ id: t.id, name: t.name, blank_image_url: t.blankImageUrl, image_width: t.imageWidth, image_height: t.imageHeight })
          setSearchOpen(false)
        }}
      />
    </>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- TemplateSidebar`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full suite, build, lint**

Run: `npm run test && npm run build && npm run lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/TemplateSidebar.tsx src/features/editor/TemplateSidebar.test.tsx
git commit -m "feat: collapsible mobile drawer for the template sidebar"
```

---

### Task 10: Build, lint, and live browser verification

**Files:** none (verification only)

- [ ] **Step 1: Full sweep**

Run: `npm run test && npm run build && npm run lint`
Expected: all clean.

- [ ] **Step 2: Desktop layout**

Start the dev server, open `/`. Verify: sidebar on the left showing "Two Buttons" (the only seeded template), canvas on the right showing the checkerboard background with nothing on it. Click the template — canvas populates with the real image and fields, exactly like before.

- [ ] **Step 3: Usage tracking**

Click the template a few times (each click should log a row). Verify via the Supabase MCP `execute_sql` tool: `select template_id, count(*) from template_usage_events group by template_id;` shows a count matching the number of clicks made during this verification pass.

- [ ] **Step 4: Search All Memes modal**

Click "Search All Memes". Verify the modal opens, shows the template, typing a non-matching search string shows "No templates match", clearing the search shows it again, clicking a tile loads it into the canvas and closes the modal.

- [ ] **Step 5: Clear Canvas confirmation**

With a template loaded, click "Clear Canvas". Verify the confirm dialog appears, Cancel leaves the canvas untouched, confirming actually clears it (back to the checkerboard-only blank state) and the sidebar/search modal are still usable afterward.

- [ ] **Step 6: Mobile drawer**

Using `resize_window` (or the pane's own mobile preset), verify the permanent sidebar column disappears below the `sm` breakpoint, replaced by a "☰ Templates" toggle; tapping it slides out the same template list as an overlay; picking a template from inside the drawer closes it and loads the template.

- [ ] **Step 7: Fix anything found, then re-run the full sweep**

Run: `npm run test && npm run build && npm run lint`
Expected: all clean before moving to finishing-a-development-branch.
