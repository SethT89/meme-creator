# Draggable, Resizable Text Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the editor canvas interactive — drag any caption box to reposition it, use the style toolbar's Size control (presets + custom input) to actually resize the selected box's text, delete a selected box, and persist all of this through Save/reload.

**Architecture:** A new `Layer` type and a handful of pure helper functions in `src/lib/layers.ts` (size presets, clamping, seeding layers from template fields or from saved `canvas_data`, drag-delta math) back an `EditorPage` that now holds a `layers` array in state instead of rendering raw `template_fields`. `PropertyBar` becomes a controlled component driven by the selected layer. `canvas_data` (already reserved in the schema, currently unused) starts actually getting written on Save.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, Tailwind v4 (`@container` + native CSS `cqw` units for the font-size scaling fix), Supabase JS client.

---

### Task 1: Layer type, size presets, and the size-label helper

**Files:**
- Create: `src/lib/layers.ts`
- Test: `src/lib/layers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/layers.test.ts
import { describe, it, expect } from 'vitest'
import { SIZE_PRESETS, MIN_FONT_SIZE, MAX_FONT_SIZE, clampFontSize, sizeLabel } from './layers'

describe('SIZE_PRESETS', () => {
  it('defines five presets in ascending px order', () => {
    expect(SIZE_PRESETS.map((p) => p.label)).toEqual(['Small', 'Medium', 'Large', 'Extra Large', 'Huge'])
    const pxValues = SIZE_PRESETS.map((p) => p.px)
    expect(pxValues).toEqual([...pxValues].sort((a, b) => a - b))
  })
})

describe('clampFontSize', () => {
  it('leaves an in-range integer value unchanged', () => {
    expect(clampFontSize(36)).toBe(36)
  })

  it('rounds a non-integer value', () => {
    expect(clampFontSize(36.6)).toBe(37)
  })

  it('clamps below the minimum up to MIN_FONT_SIZE', () => {
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE)
  })

  it('clamps above the maximum down to MAX_FONT_SIZE', () => {
    expect(clampFontSize(9999)).toBe(MAX_FONT_SIZE)
  })
})

describe('sizeLabel', () => {
  it('returns the preset name when the value matches one exactly', () => {
    expect(sizeLabel(36)).toBe('Medium')
  })

  it('returns a raw px label when the value matches no preset', () => {
    expect(sizeLabel(22)).toBe('22px')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- layers`
Expected: FAIL — `src/lib/layers.ts` does not exist yet.

- [ ] **Step 3: Implement `src/lib/layers.ts` (part 1)**

```ts
// src/lib/layers.ts
export interface Layer {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
}

export const SIZE_PRESETS: { label: string; px: number }[] = [
  { label: 'Small', px: 24 },
  { label: 'Medium', px: 36 },
  { label: 'Large', px: 48 },
  { label: 'Extra Large', px: 64 },
  { label: 'Huge', px: 88 },
]

export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 300

export function clampFontSize(px: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(px)))
}

export function sizeLabel(fontSize: number): string {
  const preset = SIZE_PRESETS.find((p) => p.px === fontSize)
  return preset ? preset.label : `${fontSize}px`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- layers`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/layers.ts src/lib/layers.test.ts
git commit -m "feat: add layer size presets and clamp/label helpers"
```

---

### Task 2: Seeding layers from template fields or saved canvas_data

**Files:**
- Modify: `src/lib/layers.ts`
- Modify: `src/lib/layers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/layers.test.ts`:

```ts
import { initialLayersFromFields, layersFromCanvasData } from './layers'

const mockFields = [
  { id: 'f1', label: 'Caption 1', position_x: 30, position_y: 50, width: 220, height: 110, font_size: 22 },
  { id: 'f2', label: 'Caption 2', position_x: 310, position_y: 70, width: 220, height: 110, font_size: 22 },
]

describe('initialLayersFromFields', () => {
  it('maps template_fields rows into layers, preserving order and converting snake_case to camelCase', () => {
    expect(initialLayersFromFields(mockFields)).toEqual([
      { id: 'f1', label: 'Caption 1', x: 30, y: 50, width: 220, height: 110, fontSize: 22 },
      { id: 'f2', label: 'Caption 2', x: 310, y: 70, width: 220, height: 110, fontSize: 22 },
    ])
  })

  it('returns an empty array for no fields', () => {
    expect(initialLayersFromFields([])).toEqual([])
  })
})

describe('layersFromCanvasData', () => {
  const fallbackFields = mockFields

  it('returns the saved layers when canvas_data has a non-empty layers array', () => {
    const saved = { layers: [{ id: 'f1', label: 'Edited', x: 1, y: 2, width: 3, height: 4, fontSize: 5 }] }
    expect(layersFromCanvasData(saved, fallbackFields)).toEqual(saved.layers)
  })

  it('falls back to deriving from template fields when canvas_data has no layers key', () => {
    expect(layersFromCanvasData({}, fallbackFields)).toEqual(initialLayersFromFields(fallbackFields))
  })

  it('falls back to deriving from template fields when canvas_data.layers is an empty array', () => {
    expect(layersFromCanvasData({ layers: [] }, fallbackFields)).toEqual(initialLayersFromFields(fallbackFields))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- layers`
Expected: FAIL — `initialLayersFromFields` and `layersFromCanvasData` are not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/layers.ts`:

```ts
interface TemplateFieldRow {
  id: string
  label: string
  position_x: number
  position_y: number
  width: number
  height: number
  font_size: number
}

export function initialLayersFromFields(fields: TemplateFieldRow[]): Layer[] {
  return fields.map((f) => ({
    id: f.id,
    label: f.label,
    x: f.position_x,
    y: f.position_y,
    width: f.width,
    height: f.height,
    fontSize: f.font_size,
  }))
}

export function layersFromCanvasData(canvasData: unknown, fallbackFields: TemplateFieldRow[]): Layer[] {
  const layers = (canvasData as { layers?: Layer[] } | null | undefined)?.layers
  if (layers && layers.length > 0) return layers
  return initialLayersFromFields(fallbackFields)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- layers`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/layers.ts src/lib/layers.test.ts
git commit -m "feat: derive layers from template fields or saved canvas_data"
```

---

### Task 3: Drag-delta math

**Files:**
- Modify: `src/lib/layers.ts`
- Modify: `src/lib/layers.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/layers.test.ts`:

```ts
import { applyDragDelta } from './layers'

describe('applyDragDelta', () => {
  const layer: Layer = { id: 'f1', label: 'Caption 1', x: 100, y: 100, width: 200, height: 100, fontSize: 32 }

  it('moves the layer by the screen delta divided by the display scale', () => {
    // displayScale 0.5 means 1 template-px is rendered as 0.5 screen-px,
    // so a 50 screen-px drag moves the layer by 100 template-px.
    const moved = applyDragDelta(layer, 50, 0, 0.5, 1000, 1000)
    expect(moved.x).toBe(200)
    expect(moved.y).toBe(100)
    expect(moved.width).toBe(200) // unchanged
    expect(moved.height).toBe(100) // unchanged
  })

  it('clamps so the box center cannot move left of the image', () => {
    const moved = applyDragDelta(layer, -10000, 0, 1, 1000, 1000)
    expect(moved.x).toBe(0 - layer.width / 2) // center clamped to x=0
  })

  it('clamps so the box center cannot move above the image', () => {
    const moved = applyDragDelta(layer, 0, -10000, 1, 1000, 1000)
    expect(moved.y).toBe(0 - layer.height / 2)
  })

  it('clamps so the box center cannot move right of the image', () => {
    const moved = applyDragDelta(layer, 10000, 0, 1, 1000, 1000)
    expect(moved.x).toBe(1000 - layer.width / 2)
  })

  it('clamps so the box center cannot move below the image', () => {
    const moved = applyDragDelta(layer, 0, 10000, 1, 1000, 1000)
    expect(moved.y).toBe(1000 - layer.height / 2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- layers`
Expected: FAIL — `applyDragDelta` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/layers.ts`:

```ts
export function applyDragDelta(
  layer: Layer,
  deltaXPx: number,
  deltaYPx: number,
  displayScale: number,
  imageWidth: number,
  imageHeight: number,
): Layer {
  const deltaX = deltaXPx / displayScale
  const deltaY = deltaYPx / displayScale
  const centerX = Math.min(imageWidth, Math.max(0, layer.x + layer.width / 2 + deltaX))
  const centerY = Math.min(imageHeight, Math.max(0, layer.y + layer.height / 2 + deltaY))
  return { ...layer, x: centerX - layer.width / 2, y: centerY - layer.height / 2 }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- layers`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/layers.ts src/lib/layers.test.ts
git commit -m "feat: add drag-delta math with image-bounds clamping"
```

---

### Task 4: Persist canvas_data through the creation mutations

**Files:**
- Modify: `src/lib/queries/creations.ts`
- Modify: `src/lib/queries/creations.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/queries/creations.test.tsx` (extend the existing supabase mock's `insert` to capture what it was called with, and add an update test):

```ts
// Replace the existing vi.mock('../supabase', ...) block with this version
// that records insert/update call arguments for assertions.
let lastInsertArgs: unknown
let lastUpdateArgs: unknown

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [mockRow], error: null }),
      }),
      insert: (args: unknown) => {
        lastInsertArgs = args
        return {
          select: () => ({
            single: () => Promise.resolve({ data: mockRow, error: null }),
          }),
        }
      },
      update: (args: unknown) => {
        lastUpdateArgs = args
        return {
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: mockRow, error: null }),
            }),
          }),
        }
      },
    }),
  },
}))
```

Add new test cases:

```ts
import { useUpdateCreation } from './creations'

describe('useCreateCreation', () => {
  // ...existing test stays...

  it('writes canvasData as the canvas_data column', async () => {
    const { result } = renderHook(() => useCreateCreation(), { wrapper })
    result.current.mutate({
      name: 'Drake 1',
      tags: ['funny'],
      sourceType: 'template',
      templateId: 'tmpl-1',
      canvasData: { layers: [{ id: 'f1', label: 'Caption 1', x: 1, y: 2, width: 3, height: 4, fontSize: 5 }] },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastInsertArgs).toMatchObject({
      canvas_data: { layers: [{ id: 'f1', label: 'Caption 1', x: 1, y: 2, width: 3, height: 4, fontSize: 5 }] },
    })
  })
})

describe('useUpdateCreation', () => {
  it('writes canvasData as the canvas_data column', async () => {
    const { result } = renderHook(() => useUpdateCreation(), { wrapper })
    result.current.mutate({
      id: '1',
      name: 'Drake 1',
      tags: ['funny'],
      canvasData: { layers: [] },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(lastUpdateArgs).toMatchObject({ canvas_data: { layers: [] } })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- creations`
Expected: FAIL — `canvasData` isn't a recognized input field, `canvas_data` is never sent.

- [ ] **Step 3: Implement**

In `src/lib/queries/creations.ts`, update both input interfaces and mutation bodies:

```ts
interface CreateCreationInput {
  name: string
  tags: string[]
  sourceType: 'template' | 'freeform'
  templateId: string | null
  canvasData: Record<string, unknown>
}
```

```ts
    mutationFn: async (input: CreateCreationInput) => {
      const { data, error } = await supabase
        .from('creations')
        .insert({
          name: input.name,
          tags: input.tags,
          source_type: input.sourceType,
          template_id: input.templateId,
          status: 'final',
          canvas_data: input.canvasData,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
```

```ts
interface UpdateCreationInput {
  id: string
  name: string
  tags: string[]
  canvasData: Record<string, unknown>
}
```

```ts
    mutationFn: async (input: UpdateCreationInput) => {
      const { data, error } = await supabase
        .from('creations')
        .update({ name: input.name, tags: input.tags, canvas_data: input.canvasData })
        .eq('id', input.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- creations`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full test suite to check for now-broken callers**

Run: `npm run test`
Expected: FAIL in `EditorPage.test.tsx` — `handleDialogSave`/`handleQuickSave` don't pass `canvasData` yet. This is expected; Task 6 fixes it. Note the failure and move on.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/creations.ts src/lib/queries/creations.test.tsx
git commit -m "feat: write canvas_data through the creation mutations"
```

---

### Task 5: PropertyBar becomes a controlled component

**Files:**
- Modify: `src/features/editor/PropertyBar.tsx`
- Modify: `src/features/editor/PropertyBar.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace `src/features/editor/PropertyBar.test.tsx` entirely:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyBar } from './PropertyBar'

describe('PropertyBar', () => {
  it('shows the current size as a preset name when it matches one exactly', () => {
    render(<PropertyBar fontSize={36} onChangeFontSize={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(/size: medium/i)).toBeInTheDocument()
  })

  it('shows the current size as a raw px label when it matches no preset', () => {
    render(<PropertyBar fontSize={22} onChangeFontSize={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()
  })

  it('clicking a preset calls onChangeFontSize with that preset\'s px value and closes the panel', async () => {
    const onChangeFontSize = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={onChangeFontSize} onDelete={() => {}} />)

    await userEvent.click(screen.getByText(/size: medium/i))
    await userEvent.click(screen.getByText('Large'))

    expect(onChangeFontSize).toHaveBeenCalledWith(48)
    expect(screen.queryByText('Extra Large')).not.toBeInTheDocument()
  })

  it('typing a custom size and pressing Enter calls onChangeFontSize with the clamped value', async () => {
    const onChangeFontSize = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={onChangeFontSize} onDelete={() => {}} />)

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)
    await userEvent.type(input, '9999{enter}')

    expect(onChangeFontSize).toHaveBeenCalledWith(300) // clamped to MAX_FONT_SIZE
  })

  it('clicking Delete calls onDelete', async () => {
    const onDelete = vi.fn()
    render(<PropertyBar fontSize={36} onChangeFontSize={() => {}} onDelete={onDelete} />)

    await userEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- PropertyBar`
Expected: FAIL — `PropertyBar` doesn't accept these props yet.

- [ ] **Step 3: Implement**

Replace `src/features/editor/PropertyBar.tsx` entirely:

```tsx
import { useState } from 'react'
import { SIZE_PRESETS, clampFontSize, sizeLabel } from '../../lib/layers'

interface PropertyBarProps {
  fontSize: number
  onChangeFontSize: (px: number) => void
  onDelete: () => void
}

export function PropertyBar({ fontSize, onChangeFontSize, onDelete }: PropertyBarProps) {
  const [panelOpen, setPanelOpen] = useState(false)

  function applyCustomSize(raw: string) {
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    onChangeFontSize(clampFontSize(parsed))
  }

  return (
    <div className="flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-1.5 text-white shadow-lg">
      <span className="rounded-full px-2 py-1 text-xs">Font</span>
      <div className="h-4 w-px bg-neutral-700" />

      <div className="relative">
        <button
          type="button"
          className="rounded-full px-2 py-1 text-xs"
          onClick={() => setPanelOpen((open) => !open)}
        >
          Size: {sizeLabel(fontSize)}
        </button>
        {panelOpen && (
          <div className="absolute bottom-full left-1/2 mb-2 w-40 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
            {SIZE_PRESETS.map((preset) => (
              <div
                key={preset.label}
                className="cursor-pointer rounded-md px-2 py-1.5 text-sm hover:bg-neutral-700"
                onClick={() => {
                  onChangeFontSize(preset.px)
                  setPanelOpen(false)
                }}
              >
                {preset.label}
              </div>
            ))}
            <div className="mt-1 border-t border-neutral-700 pt-1.5">
              <label className="block px-2 pb-1 text-[10px] uppercase text-neutral-400" htmlFor="custom-font-size">
                Custom
              </label>
              <input
                id="custom-font-size"
                aria-label="Custom font size"
                type="number"
                defaultValue={fontSize}
                className="w-full rounded-md bg-neutral-800 px-2 py-1 text-sm text-white"
                onBlur={(e) => applyCustomSize(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    applyCustomSize(e.currentTarget.value)
                    setPanelOpen(false)
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-neutral-700" />
      <span className="rounded-full px-2 py-1 text-xs">Color</span>
      <div className="h-4 w-px bg-neutral-700" />
      <span className="rounded-full px-2 py-1 text-xs">⬆ Front</span>
      <div className="h-4 w-px bg-neutral-700" />
      <button type="button" className="rounded-full px-2 py-1 text-xs text-red-400" onClick={onDelete}>
        Delete
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- PropertyBar`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/PropertyBar.tsx src/features/editor/PropertyBar.test.tsx
git commit -m "feat: wire PropertyBar's size controls and delete to real state"
```

---

### Task 6: Wire layers into EditorPage — state, rendering, drag, save/load

**Files:**
- Modify: `src/features/editor/EditorPage.tsx`
- Modify: `src/features/editor/EditorPage.test.tsx`

- [ ] **Step 1: Update the test mocks and existing assertions**

In `src/features/editor/EditorPage.test.tsx`:

1. Add `font_size` to `mockFields` (needed now that layers read it):

```ts
const mockFields = [
  { id: 'f1', template_id: 'tmpl-1', label: 'Caption 1', position_x: 30, position_y: 50, width: 220, height: 110, font_size: 22, order_index: 0 },
  { id: 'f2', template_id: 'tmpl-1', label: 'Caption 2', position_x: 310, position_y: 70, width: 220, height: 110, font_size: 22, order_index: 1 },
  { id: 'f3', template_id: 'tmpl-1', label: 'Caption 3', position_x: 60, position_y: 680, width: 480, height: 100, font_size: 28, order_index: 2 },
]
```

2. Add `canvas_data` to `savedRows`' type and to the row pushed in the "loads an existing template creation" test:

```ts
const savedRows: Array<{
  id: string
  name: string
  tags: string[]
  source_type: string
  template_id: string | null
  canvas_data?: unknown
}> = []
```

```ts
savedRows.push({ id: 'existing-1', name: 'Two Buttons 1', tags: ['funny'], source_type: 'template', template_id: 'tmpl-1', canvas_data: {} })
```

3. The two tests asserting `/size: medium/i` no longer match — the real seeded font sizes are 22/28px, neither of which is the "Medium" preset (36px). Update both to assert the real px label instead:

```ts
// in 'selecting one field shows the property bar for it...':
await userEvent.click(screen.getByText('Caption 1'))
expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()

await userEvent.click(screen.getByText('Caption 2'))
expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()

await userEvent.click(screen.getByRole('img', { name: 'Two Buttons' }))
expect(screen.queryByText(/size: 22px/i)).not.toBeInTheDocument()
```

```ts
// in 'deselects when clicking anywhere on the page...':
await userEvent.click(screen.getByText('Caption 1'))
expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()

await userEvent.click(screen.getByRole('heading', { name: 'Editor' }))
expect(screen.queryByText(/size: 22px/i)).not.toBeInTheDocument()
```

```ts
// in 'does not deselect when clicking a control inside the property bar itself':
await userEvent.click(screen.getByText('Caption 1'))
expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()

await userEvent.click(screen.getByText(/size: 22px/i))
expect(screen.getByText('Extra Large')).toBeInTheDocument()
expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()
```

4. Add new test cases at the end of the `describe('EditorPage', ...)` block:

```ts
  it('changing the size preset updates the selected box and persists it on save', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByText(/size: 22px/i))
    await userEvent.click(screen.getByText('Large'))
    expect(screen.getByText(/size: large/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save to Gallery' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await screen.findByRole('button', { name: 'Save' })
    const saved = savedRows.at(-1) as { canvas_data?: { layers?: { id: string; fontSize: number }[] } }
    const savedField1 = saved.canvas_data?.layers?.find((l) => l.id === 'f1')
    expect(savedField1?.fontSize).toBe(48)
  })

  it('deleting the selected box removes it from the canvas', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByText('Delete'))

    expect(screen.queryByText('Caption 1')).not.toBeInTheDocument()
    expect(screen.getByText('Caption 2')).toBeInTheDocument()
  })

  it('loads a saved creation\'s edited layers instead of the template defaults', async () => {
    savedRows.push({
      id: 'existing-2',
      name: 'Two Buttons 2',
      tags: [],
      source_type: 'template',
      template_id: 'tmpl-1',
      canvas_data: {
        layers: [{ id: 'f1', label: 'Caption 1', x: 30, y: 50, width: 220, height: 110, fontSize: 88 }],
      },
    })

    renderEditor('/editor/existing-2')

    await userEvent.click(await screen.findByText('Caption 1'))
    expect(screen.getByText(/size: huge/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- EditorPage`
Expected: FAIL — `PropertyBar` still unwired, fields still rendered from raw `template_fields`, no drag/delete/save-canvas_data behavior yet.

- [ ] **Step 3: Implement — layers state and rendering**

In `src/features/editor/EditorPage.tsx`:

Add imports:

```ts
import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { initialLayersFromFields, layersFromCanvasData, applyDragDelta } from '../../lib/layers'
import type { Layer } from '../../lib/layers'
```

(Merge with the existing `import { Fragment, useState } from 'react'` line — becomes `import { Fragment, useRef, useState } from 'react'` plus the separate type-only import above it.)

Replace the `fields` query line and add layers state, seeded during render the same way `source`/`savedMeta` already are (extend the existing `if (existingCreation && ...)` block rather than adding a second one, so layer-seeding stays in lockstep with source-seeding):

```ts
  const { data: fields = [] } = useTemplateFields(source?.type === 'template' ? source.templateId : undefined)
  const [layers, setLayers] = useState<Layer[]>([])
  const [layersSeededFor, setLayersSeededFor] = useState<string | undefined>(undefined)
```

In the existing sync block, after the template branch sets `source`/`savedMeta`, also seed layers — but layers need `fields`, which is a *separate* async query keyed off `source.templateId`, so seed them in a second, independent render-time check (mirroring the existing "don't mark handled until the dependency actually resolved" pattern). The seed key is the creation's id when reopening a saved creation, or `'new:' + templateId` when starting fresh, so picking the same template twice in two different fresh sessions each seed correctly:

```ts
  if (source?.type === 'template' && fields.length > 0) {
    const seedKey = existingCreation?.id ?? 'new:' + source.templateId
    if (layersSeededFor !== seedKey) {
      setLayersSeededFor(seedKey)
      setLayers(layersFromCanvasData(existingCreation?.canvas_data, fields))
    }
  }
```

Also update `startOver` to reset the new layer state, so picking the same template again after Start Over reseeds from its defaults instead of carrying over the previous session's edits (its seed key would otherwise still match):

```ts
  function startOver() {
    setSource(null)
    setSavedMeta(null)
    setSelectedFieldId(null)
    setLayers([])
    setLayersSeededFor(undefined)
    if (creationId) navigate('/')
  }
```

- [ ] **Step 4: Implement — drag handlers and container ref**

Add a ref for the rendered `<img>` (needed to measure `displayScale` at drag-start) and drag-tracking state:

```ts
  const imgRef = useRef<HTMLImageElement>(null)
  const dragState = useRef<{ id: string; startX: number; startY: number; layerStartX: number; layerStartY: number; moved: boolean } | null>(null)
```

Add handlers (place near `startOver`/`openDialog`):

```ts
  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>, layer: Layer) {
    e.stopPropagation()
    setSelectedFieldId(layer.id)
    dragState.current = { id: layer.id, startX: e.clientX, startY: e.clientY, layerStartX: layer.x, layerStartY: layer.y, moved: false }
    // Optional chaining: jsdom (used by the test suite) doesn't implement
    // setPointerCapture at all — calling it directly would throw and break
    // every test that clicks a field box. Real browsers always support it.
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragState.current
    if (!drag || !templateRow || !imgRef.current) return
    const deltaXPx = e.clientX - drag.startX
    const deltaYPx = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(deltaXPx, deltaYPx) < 4) return
    drag.moved = true
    const displayScale = imgRef.current.getBoundingClientRect().width / templateRow.image_width
    setLayers((prev) =>
      prev.map((l) =>
        l.id === drag.id
          ? applyDragDelta(
              { ...l, x: drag.layerStartX, y: drag.layerStartY },
              deltaXPx,
              deltaYPx,
              displayScale,
              templateRow.image_width,
              templateRow.image_height,
            )
          : l,
      ),
    )
  }

  function handlePointerUp() {
    dragState.current = null
  }

  function handleChangeFontSize(layerId: string, px: number) {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, fontSize: px } : l)))
  }

  function handleDeleteLayer(layerId: string) {
    setLayers((prev) => prev.filter((l) => l.id !== layerId))
    setSelectedFieldId(null)
  }
```

Note: `templateRow` is computed later in the current file (`const templateRow = ...`) — move that line above these new handlers (right after the `!source` early return, before `startOver`) since the handlers close over it.

- [ ] **Step 5: Implement — replace the fields render with layers render**

Replace the entire `{source.type === 'template' && templateRow && fields.map((field) => { ... })}` block with the version below. Note it keeps an `onClick={(e) => e.stopPropagation()}` alongside the new pointer handlers: a plain click still fires a synthetic `click` event after pointerdown/pointerup even though selection now happens on `onPointerDown`, and without stopping it the outer container's click-to-deselect handler would immediately undo the selection.

```tsx
          {source.type === 'template' &&
            templateRow &&
            layers.map((layer) => {
              const leftPct = (layer.x / templateRow.image_width) * 100
              const topPct = (layer.y / templateRow.image_height) * 100
              const widthPct = (layer.width / templateRow.image_width) * 100
              const heightPct = (layer.height / templateRow.image_height) * 100
              const fontSizeCqw = (layer.fontSize / templateRow.image_width) * 100

              return (
                <Fragment key={layer.id}>
                  <div
                    className="absolute cursor-grab touch-none overflow-hidden border-[1.5px] border-blue-500 bg-white/90 p-1 text-center font-bold text-black active:cursor-grabbing"
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${widthPct}%`,
                      height: `${heightPct}%`,
                      fontSize: `calc(${fontSizeCqw} * 1cqw)`,
                    }}
                    onPointerDown={(e) => handlePointerDown(e, layer)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {layer.label}
                  </div>

                  {selectedFieldId === layer.id && (
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
```

Add `ref={imgRef}` to the `<img>` element, and add `@container` to the wrapper div's className (the one with `relative inline-block ...`):

```tsx
        <div className="relative inline-block @container rounded-lg bg-[repeating-conic-gradient(#00000010_0%_25%,transparent_0%_50%)] bg-[length:20px_20px]">
          {source.type === 'template' ? (
            <img
              ref={imgRef}
              src={source.blankImageUrl}
              ...
```

- [ ] **Step 6: Implement — pass canvasData through save/update**

Update `handleDialogSave` and `handleQuickSave`:

```ts
  function handleDialogSave(name: string, tags: string[]) {
    const activeSource = source!
    createCreation.mutate(
      {
        name,
        tags,
        sourceType: activeSource.type,
        templateId: activeSource.type === 'template' ? activeSource.templateId : null,
        canvasData: { layers },
      },
      {
        onSuccess: (row) => {
          setSavedMeta({ id: row.id, name: row.name, tags: row.tags })
          setDialogOpen(false)
        },
      },
    )
  }

  function handleQuickSave() {
    if (!savedMeta) return
    updateCreation.mutate({ id: savedMeta.id, name: savedMeta.name, tags: savedMeta.tags, canvasData: { layers } })
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test -- EditorPage`
Expected: PASS (all cases, including the 3 new ones)

- [ ] **Step 8: Run the full suite**

Run: `npm run test`
Expected: PASS — this also resolves the expected Task 4 Step 5 failure now that callers pass `canvasData`.

- [ ] **Step 9: Commit**

```bash
git add src/features/editor/EditorPage.tsx src/features/editor/EditorPage.test.tsx
git commit -m "feat: make canvas layers draggable and wire size/delete to real state"
```

---

### Task 7: Build, lint, and live browser verification

**Files:** none (verification only)

- [ ] **Step 1: Build and lint**

Run: `npm run build && npm run lint`
Expected: both clean.

- [ ] **Step 2: Start the dev server and verify drag**

Start `npm run dev`, open the Two Buttons template, click-and-drag a caption box to a new spot on the image. Verify: the box follows the pointer smoothly, and releasing leaves it at the new spot (doesn't snap back).

- [ ] **Step 3: Verify size presets and custom input visually**

Select a box, open the Size panel, click through a couple of presets and confirm the on-canvas text visibly changes size each time (not just the button label). Type a custom value (e.g. `120`) and press Enter; confirm the text visibly grows to match. Type `9999` and Enter; confirm it clamps (doesn't grow unbounded).

- [ ] **Step 4: Verify font size scales with viewport width**

Using `resize_window` (or the pane's own viewport toggle) at a narrow width and a wide width, confirm the caption text's size relative to the image stays visually consistent at both — this is the `cqw` fix; a regression would show text that's proportionally tiny on a wide screen or oversized on a narrow one.

- [ ] **Step 5: Verify delete**

Select a box, click Delete, confirm it disappears from the canvas and the property bar closes with it.

- [ ] **Step 6: Verify persistence**

Drag a box and change another box's size, then Save to Gallery. Reload the page at that creation's `/editor/:id` URL. Confirm the box positions and sizes match what was saved, not the template's original defaults.

- [ ] **Step 7: Fix anything found, then re-run the full sweep**

Run: `npm run test && npm run build && npm run lint`
Expected: all clean before moving to finishing-a-development-branch.
