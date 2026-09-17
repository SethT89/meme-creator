# Freeform Canvas + Image Layers (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a freeform creation from "one replaceable background image with no real dimensions" into a real fixed-pixel-size canvas holding any number of independent, movable/resizable text and image layers, resizable by the user, with Add Text unblocked on it.

**Architecture:** `Layer` becomes a discriminated union (`TextLayer | ImageLayer`) in `src/lib/layers.ts`. `EditorPage.tsx` gains one generalized `activeCanvas` value (real width/height, from either a template row or a freeform source's own `canvasWidth`/`canvasHeight`) that every piece of drag/resize/render math already keyed off `templateRow` switches to use instead — this is what lets the existing text-layer machinery work unmodified for freeform. Upload Image changes from "replace the one background" to "append an image layer," auto-scaling to fit when landing on an existing canvas. Canvas resize is 3 new handles (right/bottom/bottom-right only — see the design doc's scope note) that adjust the freeform source's own dimensions.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + Testing Library, Supabase (storage bucket `creation-assets`, already provisioned).

**Design doc:** `docs/superpowers/specs/2026-09-17-freeform-canvas-images-design.md` — read it first if anything below is unclear on the *why*.

---

## Task 1: `Layer` becomes a discriminated union

**Files:**
- Modify: `src/lib/layers.ts:1-15` (the `Layer` interface), `:47-58` (`initialLayersFromFields`), `:60-80` (`createBlankTextLayer`), `:82-90` (`layersFromCanvasData`)
- Modify: `src/lib/layers.test.ts` (every place that constructs a `Layer` object literal)

- [ ] **Step 1: Replace the `Layer` interface with a discriminated union**

In `src/lib/layers.ts`, replace lines 1-15:

```ts
interface BaseLayer {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface TextLayer extends BaseLayer {
  type: 'text'
  label: string
  fontSize: number
  // true (the default): height isn't rendered as a fixed box dimension —
  // the box grows to fit wrapped text instead, so a bigger font or more
  // text never gets silently clipped. Becomes false the moment a user
  // drags the resize handle, at which point their chosen height is fixed
  // and text wraps/clips within it like any ordinary text box.
  heightAuto: boolean
}

export interface ImageLayer extends BaseLayer {
  type: 'image'
  src: string
}

export type Layer = TextLayer | ImageLayer
```

- [ ] **Step 2: Add `type: 'text'` to `initialLayersFromFields`'s output**

Replace the function body (originally lines 47-58):

```ts
export function initialLayersFromFields(fields: TemplateFieldRow[]): Layer[] {
  return fields.map((f) => ({
    type: 'text',
    id: f.id,
    label: f.label,
    x: f.position_x,
    y: f.position_y,
    width: f.width,
    height: f.height,
    fontSize: f.font_size,
    heightAuto: true,
  }))
}
```

- [ ] **Step 3: Add `type: 'text'` to `createBlankTextLayer` and narrow its return type**

Replace the function (originally lines 60-80):

```ts
// A freeform layer from CanvasFab's "Add Text" action — not derived from any
// template_fields row, just an ordinary blank Layer dropped in the middle of
// the image. Sized relative to the image so it looks reasonable regardless
// of the template's own dimensions; heightAuto (like every other layer)
// means the fixed starting height below only matters for the initial
// drag-centering math, not for clipping.
export function createBlankTextLayer(imageWidth: number, imageHeight: number): TextLayer {
  const fontSize = 36
  const width = imageWidth * 0.4
  const height = fontSize * 1.5
  return {
    type: 'text',
    id: crypto.randomUUID(),
    label: '',
    x: (imageWidth - width) / 2,
    y: (imageHeight - height) / 2,
    width,
    height,
    fontSize,
    heightAuto: true,
  }
}
```

- [ ] **Step 4: Make `layersFromCanvasData` default legacy saved layers to `type: 'text'`**

Replace the function (originally lines 82-90):

```ts
export function layersFromCanvasData(canvasData: unknown, fallbackFields: TemplateFieldRow[]): Layer[] {
  const layers = (canvasData as { layers?: Layer[] } | null | undefined)?.layers
  if (layers && layers.length > 0) {
    // Saved before heightAuto/type existed: default heightAuto to true and
    // type to 'text' — every layer saved before this feature shipped was a
    // text layer, so this is an unambiguous migration with no schema change.
    return layers.map((l) => (l.type === 'image' ? l : { ...l, type: 'text' as const, heightAuto: l.heightAuto ?? true }))
  }
  return initialLayersFromFields(fallbackFields)
}
```

- [ ] **Step 5: Update `layers.test.ts` to satisfy the new union type**

In `src/lib/layers.test.ts`:

Replace the `initialLayersFromFields` describe block's expectation (originally lines 58-69):

```ts
describe('initialLayersFromFields', () => {
  it('maps template_fields rows into layers, preserving order, converting snake_case to camelCase, and defaulting heightAuto to true', () => {
    expect(initialLayersFromFields(mockFields)).toEqual([
      { type: 'text', id: 'f1', label: 'Caption 1', x: 30, y: 50, width: 220, height: 110, fontSize: 22, heightAuto: true },
      { type: 'text', id: 'f2', label: 'Caption 2', x: 310, y: 70, width: 220, height: 110, fontSize: 22, heightAuto: true },
    ])
  })

  it('returns an empty array for no fields', () => {
    expect(initialLayersFromFields([])).toEqual([])
  })
})
```

Add one assertion inside the existing `createBlankTextLayer` "creates a blank..." test (originally lines 72-80) — insert `expect(layer.type).toBe('text')` right after `const layer = createBlankTextLayer(600, 908)`:

```ts
describe('createBlankTextLayer', () => {
  it('creates a blank, centered, auto-height layer sized relative to the image', () => {
    const layer = createBlankTextLayer(600, 908)
    expect(layer.type).toBe('text')
    expect(layer.label).toBe('')
    expect(layer.fontSize).toBe(36)
    expect(layer.heightAuto).toBe(true)
    expect(layer.width).toBe(240) // 40% of image width
    expect(layer.x).toBe((600 - layer.width) / 2) // horizontally centered
    expect(layer.y).toBe((908 - layer.height) / 2) // vertically centered
  })

  it('gives each call a unique id', () => {
    const a = createBlankTextLayer(600, 908)
    const b = createBlankTextLayer(600, 908)
    expect(a.id).not.toBe(b.id)
  })
})
```

Replace the `layersFromCanvasData` describe block (originally lines 89-110) — adds `type` to the fixtures and a new test for image-layer passthrough:

```ts
describe('layersFromCanvasData', () => {
  const fallbackFields = mockFields

  it('returns the saved layers when canvas_data has a non-empty layers array', () => {
    const saved = { layers: [{ type: 'text', id: 'f1', label: 'Edited', x: 1, y: 2, width: 3, height: 4, fontSize: 5, heightAuto: false }] }
    expect(layersFromCanvasData(saved, fallbackFields)).toEqual(saved.layers)
  })

  it('defaults heightAuto and type to their text-layer defaults for saved layers from before those fields existed', () => {
    const saved = { layers: [{ id: 'f1', label: 'Edited', x: 1, y: 2, width: 3, height: 4, fontSize: 5 }] }
    const [layer] = layersFromCanvasData(saved, fallbackFields)
    expect(layer.type).toBe('text')
    expect((layer as { heightAuto: boolean }).heightAuto).toBe(true)
  })

  it('leaves an already-saved image layer alone — no text defaults forced onto it', () => {
    const saved = { layers: [{ type: 'image', id: 'img1', src: 'https://example.com/photo.png', x: 0, y: 0, width: 100, height: 100 }] }
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

Add `type: 'text'` to the two standalone `const layer: Layer = {...}` fixtures used by `applyDragDelta` and `applyResizeDelta` (originally lines 113 and 145):

```ts
describe('applyDragDelta', () => {
  const layer: Layer = { type: 'text', id: 'f1', label: 'Caption 1', x: 100, y: 100, width: 200, height: 100, fontSize: 32, heightAuto: true }
```

```ts
describe('applyResizeDelta', () => {
  const layer: Layer = { type: 'text', id: 'f1', label: 'Caption 1', x: 100, y: 100, width: 200, height: 100, fontSize: 32, heightAuto: true }
```

Add one new test at the end of the `applyDragDelta` describe block, confirming the drag math is genuinely layer-kind-agnostic:

```ts
  it('also moves an ImageLayer — the delta math only touches x/y/width/height, not the layer kind', () => {
    const imageLayer: Layer = { type: 'image', id: 'img1', src: 'https://example.com/a.png', x: 100, y: 100, width: 200, height: 100 }
    const moved = applyDragDelta(imageLayer, 50, 0, 0.5, 1000, 1000)
    expect(moved).toEqual({ ...imageLayer, x: 200 })
  })
```

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: all `layers.test.ts` tests pass (this task touches no other file's tests).

- [ ] **Step 7: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/layers.ts src/lib/layers.test.ts
git commit -m "refactor: make Layer a TextLayer | ImageLayer discriminated union"
```

---

## Task 2: `createImageLayer` factory + `MIN_CANVAS_SIZE`

**Files:**
- Modify: `src/lib/layers.ts` (add after `createBlankTextLayer`, and add `MIN_CANVAS_SIZE` near `MIN_LAYER_SIZE`)
- Modify: `src/lib/layers.test.ts` (new tests)

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/layers.test.ts`, after the `createBlankTextLayer` describe block:

```ts
describe('createImageLayer', () => {
  it('with no canvas given, places the image at the origin at its native size — it is about to define the canvas', () => {
    const layer = createImageLayer('https://example.com/a.png', 800, 600)
    expect(layer).toEqual({ type: 'image', id: layer.id, src: 'https://example.com/a.png', x: 0, y: 0, width: 800, height: 600 })
  })

  it('with a canvas given, scales the image down to fit within 60% of the canvas and centers it', () => {
    // Canvas 1000x1000, image 800x600 (wider than tall) — width is the
    // binding constraint: 800 * scale = 600 (60% of 1000) => scale = 0.75
    const layer = createImageLayer('https://example.com/a.png', 800, 600, { width: 1000, height: 1000 })
    expect(layer.width).toBe(600)
    expect(layer.height).toBe(450)
    expect(layer.x).toBe((1000 - 600) / 2)
    expect(layer.y).toBe((1000 - 450) / 2)
  })

  it('never scales a smaller image up to fill the 60% target', () => {
    // Image already well under 60% of a huge canvas — scale factor would be
    // >1, which must clamp to 1 (native size), not enlarge it.
    const layer = createImageLayer('https://example.com/a.png', 100, 50, { width: 2000, height: 2000 })
    expect(layer.width).toBe(100)
    expect(layer.height).toBe(50)
  })

  it('gives each call a unique id', () => {
    const a = createImageLayer('https://example.com/a.png', 100, 100)
    const b = createImageLayer('https://example.com/a.png', 100, 100)
    expect(a.id).not.toBe(b.id)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/layers.test.ts`
Expected: FAIL — `createImageLayer is not exported` / `is not a function`.

- [ ] **Step 3: Implement `createImageLayer` and `MIN_CANVAS_SIZE`**

In `src/lib/layers.ts`, add `MIN_CANVAS_SIZE` right after the existing `export const MIN_LAYER_SIZE = 20` line:

```ts
// Floor for a freeform canvas's own width/height when the user drags a
// canvas-resize handle — mirrors MIN_LAYER_SIZE's role for an ordinary
// layer, just for the canvas itself.
export const MIN_CANVAS_SIZE = 100
```

Add `createImageLayer` immediately after `createBlankTextLayer`:

```ts
// Upload Image's layer factory. With no canvas yet (the very first image on
// a blank creation — this call is what establishes canvasWidth/canvasHeight
// a moment later), the image lands at the origin at its own native size, so
// it becomes the canvas's full extent. Landing on an existing canvas instead
// scales the image down to fit within 60% of the canvas's smaller dimension
// (never up — a small image stays native size) and centers it, the same
// "don't drop in bigger than the surface it's landing on" idea
// createBlankTextLayer already applies to text boxes.
export function createImageLayer(
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  canvas?: { width: number; height: number },
): ImageLayer {
  if (!canvas) {
    return { type: 'image', id: crypto.randomUUID(), src, x: 0, y: 0, width: naturalWidth, height: naturalHeight }
  }
  const scale = Math.min(1, (canvas.width * 0.6) / naturalWidth, (canvas.height * 0.6) / naturalHeight)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  return {
    type: 'image',
    id: crypto.randomUUID(),
    src,
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
  }
}
```

- [ ] **Step 4: Update the test file's imports**

In `src/lib/layers.test.ts`, add `createImageLayer` and `MIN_CANVAS_SIZE` to the existing import from `./layers`:

```ts
import {
  SIZE_PRESETS,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  clampFontSize,
  sizeLabel,
  initialLayersFromFields,
  layersFromCanvasData,
  applyDragDelta,
  applyResizeDelta,
  createBlankTextLayer,
  createImageLayer,
  MIN_LAYER_SIZE,
  MIN_CANVAS_SIZE,
} from './layers'
```

(`MIN_CANVAS_SIZE` isn't asserted on directly in this task's tests — it's imported here so Task 7's EditorPage tests, and any later direct test of it, aren't the first to introduce the import. If your editor/linter flags it as unused after this step, that's expected until Task 7; leave it, it's consumed at the `EditorPage.tsx` level, not here. If you'd rather avoid an unused-import lint warning in the interim, skip adding `MIN_CANVAS_SIZE` to this import and add it directly to `EditorPage.tsx`'s import in Task 7 instead.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/layers.test.ts`
Expected: PASS, all tests including the 4 new `createImageLayer` ones.

- [ ] **Step 6: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/layers.ts src/lib/layers.test.ts
git commit -m "feat: add createImageLayer factory and MIN_CANVAS_SIZE"
```

---

## Task 3: `PropertyBar` gets an image-layer mode (no font controls)

**Files:**
- Modify: `src/features/editor/PropertyBar.tsx` (whole file)
- Modify: `src/features/editor/PropertyBar.test.tsx` (new tests)

- [ ] **Step 1: Write the failing tests**

Add to `src/features/editor/PropertyBar.test.tsx`, at the end of the `describe('PropertyBar', ...)` block:

```ts
  it('renders without Font/Size controls when fontSize is not provided (an image layer), but still shows Delete', () => {
    render(<PropertyBar onDelete={() => {}} />)
    expect(screen.queryByText('Font')).not.toBeInTheDocument()
    expect(screen.queryByText(/size:/i)).not.toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('Delete still works when font controls are hidden', async () => {
    const onDelete = vi.fn()
    render(<PropertyBar onDelete={onDelete} />)

    await userEvent.click(screen.getByText('Delete'))

    expect(onDelete).toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/editor/PropertyBar.test.tsx`
Expected: FAIL — TypeScript error, `fontSize` and `onChangeFontSize` are currently required props (`render(<PropertyBar onDelete={() => {}} />)` won't compile).

- [ ] **Step 3: Make `fontSize`/`onChangeFontSize` optional and conditionally render the Font/Size section**

Replace the full contents of `src/features/editor/PropertyBar.tsx`:

```tsx
import { useState } from 'react'
import { SIZE_PRESETS, clampFontSize, sizeLabel } from '../../lib/layers'

interface PropertyBarProps {
  // Present for a text layer, omitted for an image layer — the Font/Size
  // section only renders when both are given.
  fontSize?: number
  onChangeFontSize?: (px: number) => void
  onDelete: () => void
}

export function PropertyBar({ fontSize, onChangeFontSize, onDelete }: PropertyBarProps) {
  const [panelOpen, setPanelOpen] = useState(false)

  function applyCustomSize(raw: string) {
    // Empty is a normal in-progress state (cleared the field to type a
    // fresh number) — Number('') is 0, not NaN, so without this guard it'd
    // flash the on-canvas text down to MIN_FONT_SIZE for a moment.
    if (raw === '') return
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    onChangeFontSize?.(clampFontSize(parsed))
  }

  return (
    <div className="flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-1.5 text-white shadow-lg">
      {fontSize !== undefined && onChangeFontSize !== undefined && (
        <>
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
                    // The on-canvas preview should track every keystroke, not
                    // just the final committed value — onBlur/Enter below are
                    // now just redundant convenience (harmless to keep; Enter
                    // also closes the panel).
                    onChange={(e) => applyCustomSize(e.currentTarget.value)}
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
        </>
      )}

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

Run: `npx vitest run src/features/editor/PropertyBar.test.tsx`
Expected: PASS, all tests (existing 6 + 2 new).

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/PropertyBar.tsx src/features/editor/PropertyBar.test.tsx
git commit -m "feat: let PropertyBar render without font controls for image layers"
```

---

## Task 4: `EditorPage` — `activeCanvas`, and generalize every `templateRow`-only dimension check

This task is a mechanical substitution: one new `activeCanvas` value, computed once, replacing every place that reads `templateRow.image_width`/`image_height` purely for the coordinate-space math (not for things that are genuinely template-only, like `blankImageUrl`). No JSX changes yet — that's Task 6.

**Files:**
- Modify: `src/features/editor/EditorPage.tsx`

- [ ] **Step 1: Update the `Source` and `FreeformCanvasData` types**

Replace lines 29-34:

```ts
type Source =
  | { type: 'freeform'; name: string; canvasWidth?: number; canvasHeight?: number }
  | { type: 'template'; name: string; templateId: string; blankImageUrl: string }
  | null
type SavedMeta = { id: string; name: string; tags: string[] } | null
type FreeformCanvasData = { layers?: Layer[]; canvasWidth?: number; canvasHeight?: number }
```

- [ ] **Step 2: Compute `templateRow` and `activeCanvas` once, right after state/refs, before any effect that needs them**

Insert this right after the `const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null)` line (originally line 100), before the `useTemplateFields` call:

```ts
  const templateRow = source?.type === 'template' ? allTemplates.find((t) => t.id === source.templateId) : undefined
  // The one generalized "how big is the surface I'm drawing on" value —
  // real pixel width/height regardless of whether that comes from a
  // template row or a freeform source's own canvasWidth/canvasHeight.
  // Every place that used to read templateRow.image_width/image_height
  // purely for the percentage/coordinate math now reads this instead, which
  // is what lets drag/resize/Add Text work identically on a freeform canvas.
  const activeCanvas = templateRow
    ? { width: templateRow.image_width, height: templateRow.image_height }
    : source?.type === 'freeform' && source.canvasWidth && source.canvasHeight
      ? { width: source.canvasWidth, height: source.canvasHeight }
      : undefined
```

- [ ] **Step 3: Simplify the `useLayoutEffect` that measures the PropertyBar's position**

Replace lines 191-217 (the whole `useLayoutEffect` block):

```ts
  useLayoutEffect(() => {
    const layer = layers.find((l) => l.id === selectedFieldId)
    // Nothing to measure — and nothing to reset either: the render below
    // already gates the portal on `isSelected`, so a stale propertyBarPos
    // simply won't be used once nothing (or a different layer) is selected.
    if (!layer || !activeCanvas) return
    function measure() {
      if (!imgRef.current || !activeCanvas || !layer) return
      const imgRect = imgRef.current.getBoundingClientRect()
      const leftPct = (layer.x / activeCanvas.width) * 100
      const topPct = (layer.y / activeCanvas.height) * 100
      const widthPct = (layer.width / activeCanvas.width) * 100
      setPropertyBarPos({
        left: imgRect.left + ((leftPct + widthPct / 2) / 100) * imgRect.width,
        top: imgRect.top + (topPct / 100) * imgRect.height,
      })
    }
    measure()
    const scrollEl = canvasScrollRef.current
    scrollEl?.addEventListener('scroll', measure)
    window.addEventListener('resize', measure)
    return () => {
      scrollEl?.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [activeCanvas, layers, selectedFieldId])
```

- [ ] **Step 4: Update the existing-creation load block's freeform branch**

Replace lines 239-250 (the `else` branch that loads a freeform creation) — this now also restores `layers` and the edit baseline, which the old code never did for freeform:

```ts
    } else {
      setLoadedCreationId(existingCreation.id)
      const canvasData = existingCreation.canvas_data as FreeformCanvasData | null
      setSource({
        type: 'freeform',
        name: existingCreation.name.replace(/ \d+$/, '') || existingCreation.name,
        canvasWidth: canvasData?.canvasWidth,
        canvasHeight: canvasData?.canvasHeight,
      })
      const seeded = layersFromCanvasData(existingCreation.canvas_data, [])
      setLayers(seeded)
      baselineLayersRef.current = seeded
      setSavedMeta({ id: existingCreation.id, name: existingCreation.name, tags: existingCreation.tags })
    }
```

- [ ] **Step 5: Remove the now-duplicate `templateRow` declaration**

Delete this line (originally line 271, right after the `if (creationId && loadingExisting)` early return):

```ts
  const templateRow = source?.type === 'template' ? allTemplates.find((t) => t.id === source.templateId) : undefined
```

(It's already computed in Step 2 above — this line would now be a duplicate `const templateRow` redeclaration and fail to compile.)

- [ ] **Step 6: Generalize `handleAddText`**

Replace lines 355-368 (the whole function, including its leading comment):

```ts
  // CanvasFab's Add Text action. A no-op until there's a real canvas to
  // place text on — no template loaded, and no freeform canvas established
  // yet (that needs at least one uploaded image; see handleImageFileSelected
  // below). Same select-and-enter-edit-mode sequence handleDoubleClick uses,
  // so the new box opens with focus and the cursor ready to type, exactly
  // like double-clicking an existing one.
  function handleAddText() {
    if (!activeCanvas) return
    const newLayer = createBlankTextLayer(activeCanvas.width, activeCanvas.height)
    setLayers((prev) => [...prev, newLayer])
    setSelectedFieldId(newLayer.id)
    editStartLabel.current = ''
    needsEditFocus.current = true
    setEditingLayerId(newLayer.id)
  }
```

- [ ] **Step 7: Generalize `handleDoubleClick`'s parameter type**

Replace lines 347-353 — narrows the parameter to `TextLayer` (this handler reads `.label`, which only exists on a text layer; Task 6 will only ever call it from the text-layer branch):

```ts
  function handleDoubleClick(e: ReactMouseEvent<HTMLDivElement>, layer: TextLayer) {
    e.stopPropagation()
    setSelectedFieldId(layer.id)
    editStartLabel.current = layer.label
    needsEditFocus.current = true
    setEditingLayerId(layer.id)
  }
```

Add `TextLayer` to the type-only import at the top of the file (originally line 23):

```ts
import type { Layer, TextLayer, ResizeSign } from '../../lib/layers'
```

- [ ] **Step 8: Generalize `handlePointerMove`**

Replace lines 441-463:

```ts
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragState.current
    if (!drag || !activeCanvas || !imgRef.current) return
    const deltaXPx = e.clientX - drag.startX
    const deltaYPx = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(deltaXPx, deltaYPx) < 4) return
    drag.moved = true
    const displayScale = imgRef.current.getBoundingClientRect().width / activeCanvas.width
    setLayers((prev) =>
      prev.map((l) =>
        l.id === drag.id
          ? applyDragDelta(
              { ...l, x: drag.layerStartX, y: drag.layerStartY },
              deltaXPx,
              deltaYPx,
              displayScale,
              activeCanvas.width,
              activeCanvas.height,
            )
          : l,
      ),
    )
  }
```

- [ ] **Step 9: Generalize `handleResizePointerMove`**

Replace lines 475-489:

```ts
  function handleResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const resize = resizeState.current
    if (!resize || !activeCanvas || !imgRef.current) return
    const deltaXPx = e.clientX - resize.startX
    const deltaYPx = e.clientY - resize.startY
    const displayScale = imgRef.current.getBoundingClientRect().width / activeCanvas.width
    setLayers((prev) =>
      prev.map((l) =>
        l.id === resize.id
          ? applyResizeDelta(resize.layerStart, deltaXPx, deltaYPx, displayScale, resize.xSign, resize.ySign)
          : l,
      ),
    )
  }
```

- [ ] **Step 10: Widen `imgRef`'s type so it can be attached to either the template `<img>` or a freeform `<div>`**

Replace line 112 (`const imgRef = useRef<HTMLImageElement>(null)`):

```ts
  const imgRef = useRef<HTMLElement>(null)
```

Update the one place that needs an `HTMLImageElement` specifically — inside `handleExport` (originally line 552), which only ever runs when `source.type === 'template'` (guarded on the line above it), so the cast is safe:

```ts
      const blob = await renderCreationToBlob(imgRef.current as HTMLImageElement, templateRow, layers)
```

- [ ] **Step 11: Type-check (JSX still references the old freeform fields — expect errors, that's fine for now)**

Run: `npx tsc -b`
Expected: errors in the JSX section only (`source.imageUrl` etc. no longer exist on `Source`) — Task 6 fixes those. Every error should be inside the `return (` block starting around what was line 577. If you see any error *outside* that block, stop and re-check this task's steps before continuing.

- [ ] **Step 12: Commit**

This task intentionally leaves the build red (JSX not yet updated) — commit anyway as a mid-refactor checkpoint isn't useful here. Skip commit for this task; Task 6 will commit the completed, green result of Tasks 4-6 together. Proceed directly to Task 5.

---

## Task 5: `EditorPage` — Upload Image adds a layer, `buildCanvasData` persists canvas size

**Files:**
- Modify: `src/features/editor/EditorPage.tsx`

- [ ] **Step 1: Import `createImageLayer` and `MIN_CANVAS_SIZE`**

Update the value import from `../../lib/layers` (originally line 22):

```ts
import { layersFromCanvasData, applyDragDelta, applyResizeDelta, createBlankTextLayer, createImageLayer, MIN_CANVAS_SIZE } from '../../lib/layers'
```

- [ ] **Step 2: Rewrite `handleImageFileSelected` to append a layer instead of replacing a background**

Replace lines 370-420 (both `handleAddImage` and `handleImageFileSelected`, including comments):

```ts
  // CanvasFab's Upload Image action. Opens the browser/OS's native file
  // picker via the hidden <input type="file"> below — on mobile that picker
  // itself offers Photo Library / Camera / Files, and the OS handles any
  // permission prompt (e.g. iOS's photo-access dialog) automatically the
  // moment the user picks one, so no explicit permission request is needed
  // here. A no-op while a template is loaded — Upload Image only applies to
  // a freeform canvas (establishing one from blank, or adding to an
  // existing one), never adds a layer on top of a template.
  function handleAddImage() {
    if (source?.type === 'template' || uploadingImage) return
    fileInputRef.current?.click()
  }

  async function handleImageFileSelected(e: ReactChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so picking the same file again still fires this handler
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setToast({ message: 'Please choose an image file.', isError: true })
      return
    }
    setUploadingImage(true)
    try {
      const { width, height } = await readImageDimensions(file)
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('creation-assets').upload(path, file)
      if (uploadError) throw uploadError
      const {
        data: { publicUrl },
      } = supabase.storage.from('creation-assets').getPublicUrl(path)

      if (source?.type === 'freeform' && source.canvasWidth && source.canvasHeight) {
        // Adding to an existing canvas — auto-scaled to fit, canvas size untouched.
        const newLayer = createImageLayer(publicUrl, width, height, { width: source.canvasWidth, height: source.canvasHeight })
        setLayers((prev) => [...prev, newLayer])
      } else {
        // Starting fresh from the blank canvas — Upload Image is its entry
        // point. This first image defines the canvas's own size.
        const baseName = file.name.replace(/\.[^/.]+$/, '').trim() || 'Untitled'
        const newLayer = createImageLayer(publicUrl, width, height)
        setSource({ type: 'freeform', name: baseName, canvasWidth: width, canvasHeight: height })
        setSavedMeta(null)
        setSelectedFieldId(null)
        setEditingLayerId(null)
        setLayers([newLayer])
        setLayersSeededFor(undefined)
        // The freshly-created canvas's starting point already includes this
        // first image — matches loadTemplate's baseline-equals-just-seeded
        // pattern, so switching away without adding anything else doesn't
        // spuriously prompt to discard work.
        baselineLayersRef.current = [newLayer]
      }
    } catch {
      setToast({ message: 'Upload failed — try again.', isError: true })
    } finally {
      setUploadingImage(false)
    }
  }
```

- [ ] **Step 3: Update `buildCanvasData` to persist `canvasWidth`/`canvasHeight`**

Replace lines 511-522:

```ts
  // Layer only has string/number fields, and the freeform extras below are
  // all string/number too, so this is genuinely JSON-safe — Json's recursive
  // index-signature type just can't verify a concrete interface without one,
  // which is a known TS/Supabase-generated-types limitation, not a real type
  // mismatch.
  function buildCanvasData(activeSource: Source): Json {
    const freeformExtras =
      activeSource?.type === 'freeform' ? { canvasWidth: activeSource.canvasWidth, canvasHeight: activeSource.canvasHeight } : {}
    return { layers, ...freeformExtras } as unknown as Json
  }
```

- [ ] **Step 4: Add canvas-resize state and handlers (used by Task 7's JSX)**

Insert right after `handleResizePointerUp` (originally lines 491-494, right before `handleChangeFontSize`):

```ts
  const canvasResizeState = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number; xSign: ResizeSign; ySign: ResizeSign } | null>(
    null,
  )

  // Canvas-resize handles (Task 7's JSX) — right/bottom edges and the
  // bottom-right corner only. Growing/shrinking from those edges never
  // needs to move existing layers' x/y, since the canvas's own origin
  // (0,0) never moves; left/top-edge growth would require shifting every
  // layer's position too and isn't needed yet (see the design doc's scope
  // note).
  function handleCanvasResizePointerDown(e: ReactPointerEvent<HTMLDivElement>, xSign: ResizeSign, ySign: ResizeSign) {
    e.stopPropagation()
    if (source?.type !== 'freeform' || !source.canvasWidth || !source.canvasHeight) return
    canvasResizeState.current = { startX: e.clientX, startY: e.clientY, startWidth: source.canvasWidth, startHeight: source.canvasHeight, xSign, ySign }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handleCanvasResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const resize = canvasResizeState.current
    if (!resize || !imgRef.current) return
    const displayScale = imgRef.current.getBoundingClientRect().width / resize.startWidth
    const deltaX = (e.clientX - resize.startX) / displayScale
    const deltaY = (e.clientY - resize.startY) / displayScale
    setSource((prev) =>
      prev?.type === 'freeform'
        ? {
            ...prev,
            canvasWidth: resize.xSign === 1 ? Math.max(MIN_CANVAS_SIZE, resize.startWidth + deltaX) : prev.canvasWidth,
            canvasHeight: resize.ySign === 1 ? Math.max(MIN_CANVAS_SIZE, resize.startHeight + deltaY) : prev.canvasHeight,
          }
        : prev,
    )
  }

  function handleCanvasResizePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    canvasResizeState.current = null
  }
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: same JSX-only errors as Task 4's Step 11 — nothing new from this task's changes. If you see a new error outside the JSX block, fix it before continuing (likely a typo in the code above).

- [ ] **Step 6: Do not commit yet** — the build is still red until Task 6's JSX changes land. Proceed directly to Task 6.

---

## Task 6: `EditorPage` — render the freeform canvas and image layers

**Files:**
- Modify: `src/features/editor/EditorPage.tsx` (JSX only)

- [ ] **Step 1: Replace the freeform background rendering**

Replace lines 697-713 (the two `source?.type === 'freeform' && ...` blocks that used to render the single background image or its placeholder):

```tsx
            {source?.type === 'freeform' && activeCanvas && (
              <div
                ref={imgRef as React.RefObject<HTMLDivElement>}
                style={{ aspectRatio: `${activeCanvas.width} / ${activeCanvas.height}` }}
                className="block max-h-[65vh] w-auto max-w-full bg-white sm:max-h-[calc(100vh-19rem)] sm:min-h-[240px]"
              />
            )}
            {source?.type === 'freeform' && !activeCanvas && (
              <div className="flex h-80 w-80 items-center justify-center border border-border bg-muted text-sm text-muted-foreground">
                {source.name}
              </div>
            )}
```

`React` isn't currently imported as a namespace in this file (only named imports) — add it so the `React.RefObject<HTMLDivElement>` cast above resolves. Update the first import line (originally line 1):

```tsx
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
```

And use `RefObject<HTMLDivElement>` instead of `React.RefObject<HTMLDivElement>` in the cast above:

```tsx
                ref={imgRef as RefObject<HTMLDivElement>}
```

- [ ] **Step 2: Generalize the layers container's gate from `templateRow` to `activeCanvas`, and branch each layer on its `type`**

Replace lines 715-877 (the entire `{source?.type === 'template' && templateRow && (...)}` block through its closing `)}`) with the generalized version below. This keeps the text-layer JSX identical (just `templateRow` → `activeCanvas`), and adds a new image-layer branch alongside it:

```tsx
            {activeCanvas && (
              // A separate, absolutely-positioned @container layer rather than
              // putting @container directly on the inline-block wrapper above:
              // an element that shrink-wraps to its content (inline-block) and
              // is also a size container at once is a circular CSS dependency
              // browsers resolve by collapsing it to 0×0. This inner div is
              // inset:0 — its size comes from the already-resolved outer box
              // (which shrink-wraps to the sized img/div above), not from its
              // own content, so containment here has nothing circular to resolve.
              <div className="absolute inset-0 @container">
                {layers.map((layer) => {
                  const leftPct = (layer.x / activeCanvas.width) * 100
                  const topPct = (layer.y / activeCanvas.height) * 100
                  const widthPct = (layer.width / activeCanvas.width) * 100
                  const heightPct = (layer.height / activeCanvas.height) * 100
                  const isSelected = selectedFieldId === layer.id
                  const isEditing = editingLayerId === layer.id

                  return (
                    <Fragment key={layer.id}>
                      {layer.type === 'image' ? (
                        <div
                          className={`absolute touch-none cursor-grab active:cursor-grabbing ${
                            isSelected ? 'border border-blue-500' : 'border border-transparent'
                          }`}
                          style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%` }}
                          onPointerDown={(e) => handlePointerDown(e, layer)}
                          onPointerMove={handlePointerMove}
                          onPointerUp={handlePointerUp}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <img src={layer.src} alt="" draggable={false} className="h-full w-full select-none object-cover" />
                          {isSelected &&
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
                      ) : (
                        <div
                          // Forces a full remount (not a diff) when entering/exiting
                          // edit mode. While editing, the browser mutates this
                          // element's real DOM text via native contentEditable
                          // typing — React never tracks those changes (children
                          // renders as `false` below). Reconciling back into
                          // React-owned `{layer.label}` children afterward would
                          // make React try to diff against DOM it doesn't
                          // recognize, which can throw. A key change sidesteps
                          // that entirely: React just discards the old subtree
                          // and mounts a fresh one.
                          key={isEditing ? `${layer.id}-edit` : `${layer.id}-view`}
                          // White fill + black outline (classic meme-text look) —
                          // legible regardless of what's underneath. Stroke width
                          // in em so it scales with this box's own font-size
                          // (itself already scaled to the image via cqw, see
                          // fontSize below) without a second scaling calc.
                          // paint-order draws the stroke behind the fill so it
                          // doesn't eat into/thin the white letterforms.
                          className={`absolute p-1 text-center font-bold text-white outline-none [-webkit-text-stroke:0.24em_black] [paint-order:stroke_fill] ${
                            isSelected ? 'border border-blue-500' : 'border border-transparent'
                          } ${isEditing ? 'cursor-text' : 'cursor-grab touch-none active:cursor-grabbing'} ${
                            isSelected && !isEditing ? 'hover:underline hover:decoration-blue-500' : ''
                          }`}
                          style={{
                            left: `${leftPct}%`,
                            top: `${topPct}%`,
                            width: `${widthPct}%`,
                            // heightAuto (the default): no explicit height, so the
                            // box grows to fit wrapped text instead of clipping it
                            // — a bigger font or more text is never silently cut
                            // off. Dragging a resize handle below sets an explicit
                            // height and turns this off permanently for that box,
                            // same as any ordinary text box.
                            ...(layer.heightAuto ? {} : { height: `${heightPct}%` }),
                            fontSize: `calc(${(layer.fontSize / activeCanvas.width) * 100} * 1cqw)`,
                          }}
                          // contentEditable while editing, not React `children` —
                          // React thinks this element's children is just `false`
                          // (see below) so it never touches the live DOM text via
                          // reconciliation, which is what would reset the cursor
                          // to the start on every keystroke. The ref sets the
                          // starting text once; typing after that is the browser's
                          // own contentEditable behavior, read back via onInput.
                          contentEditable={isEditing}
                          suppressContentEditableWarning
                          ref={
                            isEditing
                              ? (el) => {
                                  // needsEditFocus (set at the two places that start
                                  // an edit session) catches the case textContent
                                  // !== label can't: a brand-new *blank* box, where
                                  // both start at '' and look already "in sync".
                                  if (el && (el.textContent !== layer.label || needsEditFocus.current)) {
                                    el.textContent = layer.label
                                    el.focus()
                                    needsEditFocus.current = false
                                    // Select the existing text so the first
                                    // keystroke replaces it, like renaming a
                                    // layer in most design tools. Best-effort:
                                    // a stale Range/Selection from a previous
                                    // edit session can throw here in some
                                    // environments — editing still works fine
                                    // without the selection, so don't let it
                                    // block entering edit mode.
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
                          {/* Hidden while editing: these render as children of
                              the contentEditable box, and the browser's native
                              editing engine can restructure/move child nodes
                              during text selection — which then breaks React's
                              own bookkeeping of them. Resizing mid-type isn't a
                              real use case anyway; finish editing first. */}
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
                      )}

                      {isSelected &&
                        propertyBarPos &&
                        createPortal(
                          <div
                            className="fixed z-50"
                            style={{
                              left: propertyBarPos.left,
                              top: propertyBarPos.top,
                              // Anchored to the field's own position — sits
                              // just above the field, horizontally centered on it.
                              transform: 'translate(-50%, calc(-100% - 8px))',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <PropertyBar
                              fontSize={layer.type === 'text' ? layer.fontSize : undefined}
                              onChangeFontSize={layer.type === 'text' ? (px) => handleChangeFontSize(layer.id, px) : undefined}
                              onDelete={() => handleDeleteLayer(layer.id)}
                            />
                          </div>,
                          document.body,
                        )}
                    </Fragment>
                  )
                })}
              </div>
            )}
            {source?.type === 'freeform' &&
              activeCanvas &&
              selectedFieldId === null &&
              (() => {
                const CANVAS_RESIZE_HANDLES: { key: string; top: string; left: string; cursor: string; xSign: ResizeSign; ySign: ResizeSign }[] = [
                  { key: 'rm', top: '50%', left: '100%', cursor: 'ew-resize', xSign: 1, ySign: 0 },
                  { key: 'bm', top: '100%', left: '50%', cursor: 'ns-resize', xSign: 0, ySign: 1 },
                  { key: 'br', top: '100%', left: '100%', cursor: 'nwse-resize', xSign: 1, ySign: 1 },
                ]
                return (
                  <div className="absolute inset-0">
                    {CANVAS_RESIZE_HANDLES.map((handle) => (
                      <div
                        key={handle.key}
                        className="absolute z-10 h-2.5 w-2.5 touch-none border border-neutral-500 bg-white"
                        style={{ top: handle.top, left: handle.left, transform: 'translate(-50%, -50%)', cursor: handle.cursor }}
                        onPointerDown={(e) => handleCanvasResizePointerDown(e, handle.xSign, handle.ySign)}
                        onPointerMove={handleCanvasResizePointerMove}
                        onPointerUp={handleCanvasResizePointerUp}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ))}
                  </div>
                )
              })()}
```

(`CANVAS_RESIZE_HANDLES` is declared inline via an IIFE here rather than as a module-level constant next to `RESIZE_HANDLES` purely to keep this step's diff self-contained — feel free to hoist it to a module-level `const CANVAS_RESIZE_HANDLES = [...]` right after the existing `RESIZE_HANDLES` array instead, which is the more natural home for it and avoids re-creating the array on every render. If you hoist it, delete the inline declaration and the wrapping `(() => { ... })()`, leaving just the `<div className="absolute inset-0">...</div>` JSX directly.)

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: some `EditorPage.test.tsx` failures are likely at this point — Task 8 rewrites that file's freeform-related coverage and adds the Supabase storage mock these new code paths need. Template-only tests (the large majority of the existing suite) should all still pass, since the template branch's JSX is behaviorally unchanged (only `templateRow` → `activeCanvas`, which are equal in that branch). If a *template* test now fails, stop and investigate before moving to Task 7 — that would indicate a mistake in this task's substitution, not a Task-8 gap.

- [ ] **Step 4: Type-check**

Run: `npx tsc -b`
Expected: no errors now (Tasks 4-6 together should be fully green).

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/EditorPage.tsx
git commit -m "feat: generalize the canvas to a freeform activeCanvas with image + text layers"
```

---

## Task 7: Mock Supabase Storage + `Image` in tests, then cover the new behavior

**Files:**
- Modify: `src/features/editor/EditorPage.test.tsx`

- [ ] **Step 1: Add the `storage` mock to the existing `supabase` mock**

In `src/features/editor/EditorPage.test.tsx`, the `vi.mock('../../lib/supabase', ...)` factory currently returns `{ supabase: { from: (table) => {...} } }`. Add a sibling `storage` key — replace the outer return object (keep the existing `from` function body exactly as-is, just add `storage` alongside it):

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
    storage: {
      from: (bucket: string) => ({
        upload: (path: string) => Promise.resolve({ data: { path }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.com/${bucket}/${path}` } }),
      }),
    },
  },
}))
```

- [ ] **Step 2: Add a jsdom `Image`/`URL.createObjectURL` stub, and a `selectImageFile` test helper**

jsdom doesn't implement real image decoding, so `readImageDimensions` (which relies on a real `Image`'s `onload` firing) needs a stub. Add this near the top of the file, after the existing `vi.mock` calls and before `function renderEditor(...)`:

```ts
// jsdom doesn't decode images or implement createObjectURL — stub both so
// readImageDimensions (src/features/editor/EditorPage.tsx) resolves with a
// fixed, known size instead of hanging forever.
class MockImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 400
  naturalHeight = 300
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

async function selectImageFile(filename = 'photo.png') {
  const file = new File(['fake-bytes'], filename, { type: 'image/png' })
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await userEvent.upload(input, file)
}
```

Add a `beforeEach` right after that (module-level, applying to every test in the file — the existing `Export` describe block has its own nested `beforeEach` for export-specific mocks, which is unaffected by this one):

```ts
beforeEach(() => {
  vi.stubGlobal('Image', MockImage)
  URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  URL.revokeObjectURL = vi.fn()
})
```

- [ ] **Step 3: Write the new/updated tests**

Add a new `describe('Upload Image', ...)` block at the end of the file, right before the closing `})` of the outer `describe('EditorPage', ...)`:

```ts
  describe('Upload Image', () => {
    it('on the blank canvas, establishes a freeform canvas sized to the uploaded image, with the image itself as a layer', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' }) // wait for sidebar to load

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('vacation.png')

      const img = await screen.findByAltText('')
      expect(img).toHaveAttribute('src', expect.stringContaining('creation-assets'))
      // MockImage reports 400x300 — that's now the canvas's own size, and
      // this first image fills it exactly (no canvas param passed to
      // createImageLayer for the very first upload).
      expect(img).toHaveStyle({ width: '100%', height: '100%' })
    })

    it('adding a second image onto an existing freeform canvas appends a smaller, centered layer without resizing the canvas', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('first.png')
      await screen.findByAltText('')

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile('second.png')

      const images = await screen.findAllByAltText('')
      expect(images).toHaveLength(2)
      // The first image still fills the (unchanged) canvas...
      expect(images[0]).toHaveStyle({ width: '100%', height: '100%' })
      // ...the second is scaled down to fit within it (60% of 400x300 —
      // width is the binding constraint here too).
      expect(images[1]).not.toHaveStyle({ width: '100%', height: '100%' })
    })

    it('does nothing while a template is loaded', async () => {
      renderEditor()
      await userEvent.click(await screen.findByText('Two Buttons'))

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))

      // No hidden-input click side effect worth asserting on directly, but
      // the template's own image must still be the only image on the page —
      // no freeform canvas got created underneath it.
      expect(screen.getAllByRole('img')).toHaveLength(1)
    })

    it('Add Text now works once a freeform canvas exists (previously a hard no-op)', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile()
      await screen.findByAltText('')

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Add Text' }))

      expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(1)
    })

    it('Add Text still does nothing on a truly blank canvas (no image uploaded yet)', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })

      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Add Text' }))

      expect(document.querySelectorAll('[contenteditable="true"]')).toHaveLength(0)
    })

    it('selecting an image layer shows Delete in the property bar but no Font/Size control', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))

      await userEvent.click(img)

      expect(screen.getByText('Delete')).toBeInTheDocument()
      expect(screen.queryByText(/size:/i)).not.toBeInTheDocument()
    })

    it('canvas resize handles appear for a freeform canvas only when nothing is selected, never for a template', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      const img = await selectImageFile().then(() => screen.findByAltText(''))

      const canvasHandleSelector = '.border-neutral-500.bg-white'
      expect(document.querySelectorAll(canvasHandleSelector)).toHaveLength(3)

      await userEvent.click(img) // select the image layer
      expect(document.querySelectorAll(canvasHandleSelector)).toHaveLength(0)
    })

    it('dragging the bottom-right canvas handle grows the canvas, persisted through save', async () => {
      renderEditor()
      await screen.findByRole('button', { name: 'Two Buttons' })
      await userEvent.click(screen.getByRole('button', { name: 'Open add menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
      await selectImageFile()
      await screen.findByAltText('')

      // jsdom never lays anything out for real (getBoundingClientRect is
      // all-zero by default) — handleCanvasResizePointerMove divides the
      // pointer delta by the canvas element's rendered width to convert
      // screen pixels back to canvas pixels, so it needs a real width here.
      // The freeform canvas container (imgRef) is the sibling <div> with the
      // aspect-ratio inline style, right before the @container layers div —
      // not an ancestor of the <img>, which lives inside that separate
      // @container div as its own layer box.
      const canvasEl = document.querySelector('[style*="aspect-ratio"]') as HTMLElement
      vi.spyOn(canvasEl, 'getBoundingClientRect').mockReturnValue({
        width: 400,
        height: 300,
        top: 0,
        left: 0,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      const brHandle = document.querySelectorAll('.border-neutral-500.bg-white')[2]
      fireEvent.pointerDown(brHandle, { clientX: 0, clientY: 0 })
      fireEvent.pointerMove(brHandle, { clientX: 100, clientY: 50 })
      fireEvent.pointerUp(brHandle)

      await userEvent.click(screen.getByRole('button', { name: 'More options' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
      const dialog = screen.getByRole('dialog')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

      const saved = savedRows.at(-1) as { canvas_data?: { canvasWidth?: number; canvasHeight?: number } }
      expect(saved.canvas_data?.canvasWidth).toBe(500) // 400 + 100
      expect(saved.canvas_data?.canvasHeight).toBe(350) // 300 + 50
    })
  })
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — every test in `EditorPage.test.tsx` (existing template coverage + all new freeform coverage), and the full suite (`layers.test.ts`, `PropertyBar.test.tsx`, everything else) untouched and green.

If any test still fails, read the failure output carefully before changing anything — in particular:
- If `findByAltText('')` finds more than one match unexpectedly, check whether a previous test's `cleanup()` ran (it should, via `src/test/setup.ts`'s `afterEach`) — a leaked DOM node from a prior test is the most likely cause of an unexpected count.
- If `getBoundingClientRect` mocking in the last test (Step 3) doesn't take effect, confirm `vi.spyOn` targets the *actual* DOM node under test (log `canvasEl.outerHTML` temporarily to confirm the selector matched the right element) rather than guessing further changes.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `npx eslint src/features/editor/EditorPage.test.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/editor/EditorPage.test.tsx
git commit -m "test: cover freeform image layers, canvas resize, and unblocked Add Text"
```

---

## Task 8: Full-suite verification and manual browser check

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all tests pass, across every file — this is the first point where every prior task's change is exercised together.

- [ ] **Step 2: Type-check and lint the whole project**

Run: `npx tsc -b && npx eslint .`
Expected: no errors from either command.

- [ ] **Step 3: Manual browser verification**

Start the dev server preview and, in the running app:
1. On the blank canvas, open the FAB and click "Upload Image." Pick a real image file. Confirm it appears at what should be the canvas's full size (nothing else on the canvas yet).
2. Click "Upload Image" again and pick a second file. Confirm it appears smaller than the first, roughly centered, and both are independently draggable/resizable (drag each one, resize each one via its corner handles, confirm the other is unaffected).
3. With nothing selected, confirm 3 gray resize handles appear at the canvas's right edge, bottom edge, and bottom-right corner. Drag the bottom-right one and confirm the canvas grows, existing images stay where they were (don't jump or rescale).
4. Click one of the images to select it — confirm the canvas resize handles disappear and the image's own blue resize handles + PropertyBar (Delete only, no Font/Size) appear instead.
5. Open the FAB and click "Add Text" — confirm a new text box appears, in edit mode, same as it does on a template.
6. Save the creation (More Options → Save), reload the page (or navigate to My Saves and back into this creation), and confirm the canvas size and both images (and the text) all reappear exactly as left.
7. Confirm nothing regressed on a template creation: pick a template from the sidebar, confirm Add Text/drag/resize/Export/Save all still work as before.

Report what you saw for each of the 7 checks — this step doesn't have a pass/fail command to run, so it needs an explicit before/after description instead of "looks fine."

- [ ] **Step 4: Final commit if the manual check turned up any small fixes**

If Step 3 surfaced anything (a class name, an off-by-one in the scale-to-fit math, etc.), fix it, re-run Step 1's test suite, and commit:

```bash
git add -A
git commit -m "fix: <describe what the manual check caught>"
```

If Step 3 found nothing, there's nothing to commit here — Stage 1 is done on the `feature/freeform-canvas-images` branch, ready for the user's own local review before merging.

---

## Explicitly not in this plan (Stage 2 / Stage 3, per the design doc)

- Image cropping (double-click/double-select an image layer).
- Freeform export (the Export button stays disabled for `source?.type === 'freeform'`).
- Left/top-edge canvas growth, layer z-order controls, canvas aspect-ratio locking.

Each gets its own brainstorming + planning pass once this stage is merged and its real shape in code is settled.
