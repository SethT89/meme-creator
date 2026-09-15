# Draggable, Resizable Text Layers — Design

## Purpose

Today the editor renders each template's caption boxes as fixed, immovable
positions taken straight from `template_fields`, and the style toolbar
(`PropertyBar`) is entirely disconnected from state — selecting a "Size"
preset changes nothing. This round makes the canvas actually interactive:

- Drag any caption box to reposition it.
- The style toolbar's Size control (presets + a custom numeric input) really
  changes the selected box's font size.
- Delete really removes the selected box.
- Changes persist through Save/Save As and reload.

Out of scope for this round (explicitly deferred, per user confirmation):
typing/editing the caption text itself (still static placeholder text),
corner-drag resizing of box width/height, Font family and Color controls,
and freeform (`+Text`/`+Sticker`) layers — those buttons stay disabled.

## Data model

`creations.canvas_data` (jsonb) already exists in the schema specifically for
this ("holds the full layer state" per its column comment) but nothing writes
to it yet — every creation is saved with the default `{}`. This design starts
using it.

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
```

All of `x/y/width/height/fontSize` are in the **same coordinate space
`template_fields` already uses**: pixels relative to the template's own
`image_width`/`image_height`, not screen pixels. This matches the existing
`position_x/position_y/width/height/font_size` columns exactly, so a
template's fields translate into layers with no unit conversion.

**Layer lifecycle:**
- **Starting a new creation from a template:** layers are seeded 1:1 from
  that template's `template_fields` rows (ordered by `order_index`).
- **Reopening a saved creation:** layers come from
  `existingCreation.canvas_data.layers` when present and non-empty. If it's
  missing/empty (e.g. a creation saved before this feature existed), fall
  back to deriving layers from the template's fields, same as a new creation.
- **Save / Save As:** the current in-memory `layers` array is written to
  `canvas_data` as `{ layers }`.
- Freeform (non-template) creations have no fields to seed from, so their
  `layers` array is simply empty — nothing to drag, consistent with `+Text`
  staying disabled this round.

## Font size presets

Defined in the same template-pixel unit the `font_size` column already uses,
so they land in the same range as today's seeded values (22–28px for the Two
Buttons template):

| Preset | px (template space) |
|---|---|
| Small | 24 |
| Medium | 36 |
| Large | 48 |
| Extra Large | 64 |
| Huge | 88 |

Plus a "Custom" numeric input in the same size panel for an exact value,
clamped to 8–300px.

```ts
// src/lib/layers.ts
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
```

## Rendering fix: font size must scale with the displayed image

Position and width/height are already rendered as CSS percentages of the
image wrapper, so they naturally scale at any viewport size. Font size is
currently rendered as a literal `${field.font_size}px` — a fixed screen-pixel
value regardless of how large the template image is actually displayed. That
means a 24px template-space font renders as literally 24 screen px whether
the image is shown at 300px or 1200px wide — inconsistent with position/width
and visibly wrong at some viewport sizes.

Fix: make the image wrapper a CSS containment context and express font size
in `cqw` (1cqw = 1% of the container's width) — the same percentage-of-image
math already used for position, just applied to font size too:

```tsx
<div className="relative inline-block @container ...">
  ...
  <div style={{ fontSize: `calc(${(field.fontSize / templateRow.image_width) * 100} * 1cqw)` }}>
```

Tailwind v4 ships `@container` utilities for this out of the box. No JS
measurement, ResizeObserver, or window-resize listener needed.

## Drag-to-move

- `onPointerDown` on a layer's box: selects it (as today, via
  `setSelectedFieldId`) and records the pointer's start position plus the
  layer's start `x`/`y`, without moving anything yet.
- `onPointerMove` (attached via the element's own pointer-capture, so no
  window-level listener to manage): if the pointer has moved more than a
  small threshold (~4px) from its start, convert the screen-pixel delta into
  template-pixel delta using `displayScale = imgRenderedWidthPx /
  templateRow.image_width` (measured once at drag-start via
  `imgRef.current.getBoundingClientRect()`), and update the layer's `x`/`y`
  in local state.
- `onPointerUp`: ends the drag. If the pointer never crossed the movement
  threshold, this was a plain click — selection already happened on pointer
  down, nothing else changes.
- Dragging is clamped so the box's center cannot leave the image bounds
  (prevents losing a box completely off-canvas); the box itself may still
  partially overhang an edge.

Pure, testable helper:

```ts
// src/lib/layers.ts
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

## `PropertyBar` becomes controlled

Currently `PropertyBar` takes no props — it owns fake local state for the
size panel and nothing it does affects the canvas. It becomes:

```ts
interface PropertyBarProps {
  fontSize: number
  onChangeFontSize: (px: number) => void
  onDelete: () => void
}
```

- Clicking a preset calls `onChangeFontSize(preset.px)` immediately (and
  closes the panel, as today).
- The custom input calls `onChangeFontSize(clampFontSize(value))` on blur and
  on Enter.
- "Delete" calls `onDelete()` directly (no confirmation — matches the
  lightweight feel of the rest of the editor; the box is only gone from this
  session until Save, so it's cheaply reversible via Start Over).
- Font/Color/Front remain inert labels, unchanged.

## `EditorPage` changes

- Replace the `fields` (raw `useTemplateFields` rows) rendering with a new
  `layers` state array (`useState<Layer[]>`), following the same
  render-time-sync-from-async-data pattern already used for
  `source`/`savedMeta` (not a `useEffect`), keyed off `loadedCreationId` /
  `source.templateId` so it only (re)initializes once per creation load, not
  on every render, and doesn't clobber in-progress edits.
- The box `.map()` renders from `layers` instead of `fields`; drag handlers
  live there.
- `selectedFieldId` (renamed conceptually to "selected layer id", same
  variable) drives which layer's real `fontSize` gets passed into
  `PropertyBar`, and `onChangeFontSize`/`onDelete` update that layer in the
  `layers` array by id.
- `handleDialogSave` and `handleQuickSave` pass `canvasData: { layers }`
  through to the mutations.

## Data layer changes

`useCreateCreation` and `useUpdateCreation` (`src/lib/queries/creations.ts`)
gain a `canvasData: Record<string, unknown>` field on their input types, and
write it as the `canvas_data` column on insert/update.

## Testing

Pure logic gets unit tests in `src/lib/layers.test.ts`:
- `SIZE_PRESETS` values / `clampFontSize` boundary behavior (below min, above
  max, in range, non-integer input).
- Deriving initial layers from `template_fields` rows.
- Deriving layers from a `canvas_data.layers` payload, and the empty/missing
  fallback-to-template-fields case.
- `applyDragDelta`: moves by the expected amount given a scale factor, and
  clamps when the delta would push the box's center outside the image
  bounds (all four directions).

`PropertyBar.test.tsx` (already exists, currently tests the old
disconnected version) gets updated to assert: clicking a preset calls
`onChangeFontSize` with that preset's px value; typing a custom value and
blurring calls it with the clamped value; clicking Delete calls `onDelete`.

Actual pointer-drag interaction and the `cqw` rendering fix are verified live
in the browser pane (as with other interactive UI this session) rather than
in jsdom, which doesn't lay out real pixel geometry.

## Out of scope (explicitly deferred)

- Editing caption text content.
- Corner-drag resize of box width/height.
- Font family picker, Color picker, Front-to-back reordering.
- `+Text` / `+Sticker` freeform layer creation.
