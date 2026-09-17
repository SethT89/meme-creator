# Freeform Canvas + Image Layers — Design

## Overview

Today, a freeform creation can only ever have a single background image
(shipped in the previous commit, `d64e9c7`), and has no real pixel
dimensions of its own — the "blank canvas" the user sees before any image
exists is pure CSS sized to the viewport (`EditorPage.tsx:558-559`), with
nothing backing it for export purposes.

This spec supersedes that single-background model with a real freeform
canvas: a fixed pixel-dimension surface that holds any number of
independent, movable/resizable **image layers** and **text layers**, plus
the ability to resize the canvas itself. This is the foundation three
follow-on efforts depend on — image cropping, freeform export, and (as a
direct unblock) enabling Add Text on freeform creations, which today is a
hard no-op without a template.

This document specs **Stage 1 (the foundation)** in full. Stages 2 and 3
are scoped at a summary level only — each gets its own brainstorming pass
immediately before it's built, once Stage 1's actual shape is settled in
code.

## Decisions from discussion

- A freeform canvas has no real size until the first image is uploaded —
  that image's native pixel dimensions become the canvas's `canvasWidth` /
  `canvasHeight`.
- The user can resize the canvas afterward. Existing layers stay at their
  absolute positions — the canvas viewport grows or shrinks around them,
  clipping content that falls outside its bounds (a fixed-size frame, not
  a scale-to-fit).
- Every image — including the first one — is an ordinary layer: movable,
  resizable, deletable, no different from a text layer except in kind.
- Uploading a second (and later) image onto an existing canvas auto-scales
  it down to fit reasonably within the canvas; the user enlarges it
  manually if they want it bigger. It does not drop in at native size.
- Text and image layers are different entities with different available
  actions/tools (confirmed) — modeled as a discriminated union, not one
  flat interface with optional fields.

## Scope simplification: which edges resize the canvas

Growing the canvas "in the direction you drag" while keeping existing
layers at their absolute positions is straightforward when growing
right/down — width/height simply increase, origin stays at `(0,0)`, no
layer's `x`/`y` needs to change. Growing left/up is a different problem:
the canvas's own origin would need to shift, which means every existing
layer's `x`/`y` would need to shift with it to stay visually in place —
meaningfully more moving parts for a case that isn't a stated need (the
motivating example was "stack another image below," i.e. grow down).

**Stage 1 ships resize handles only on the bottom edge, right edge, and
bottom-right corner** (3 of the 8 handle positions text layers use).
Growing/shrinking from those edges never requires touching existing
layers' coordinates. Left/top-edge canvas growth is left out for now — if
it turns out to be needed, it's a follow-up, not a blocker for this stage.

## Data model

`src/lib/layers.ts` — `Layer` becomes a discriminated union:

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
  heightAuto: boolean
}

export interface ImageLayer extends BaseLayer {
  type: 'image'
  src: string
}

export type Layer = TextLayer | ImageLayer
```

`applyDragDelta` and `applyResizeDelta` already only touch
`id`/`x`/`y`/`width`/`height`, so both keep working unchanged on either
layer kind. `initialLayersFromFields` and `createBlankTextLayer` both gain
`type: 'text'` on their returned objects (the only call sites that
construct a `Layer` today). `layersFromCanvasData`'s back-compat default
(`heightAuto ?? true`) also defaults `type` to `'text'` for any
previously-saved layer that predates this field — every layer saved before
today was a text layer, so this is a safe, unambiguous migration with no
schema change needed.

New factory, mirroring `createBlankTextLayer`:

```ts
// Placed at the canvas's origin at native size when it's the very first
// layer (defining canvasWidth/canvasHeight); otherwise scaled to fit
// within the existing canvas and centered.
export function createImageLayer(
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  canvas?: { width: number; height: number },
): ImageLayer
```

`Source`'s freeform variant (`EditorPage.tsx`) drops the `imageUrl` /
`imageWidth` / `imageHeight` fields shipped in `d64e9c7` (dead on arrival —
Stage 1 replaces that model before it has any real saved data to migrate)
in favor of:

```ts
{ type: 'freeform'; name: string; canvasWidth?: number; canvasHeight?: number }
```

`canvas_data` (the existing free-form JSON column, already used for
`{layers}`) gains sibling fields for freeform creations only:
`{ layers, canvasWidth, canvasHeight }`. Template creations keep storing
just `{ layers }` — their dimensions already come from the template row.

## Rendering & interaction

Introduce one local concept in `EditorPage.tsx` that generalizes what
`templateRow` provides today — real pixel width/height for the current
canvas, regardless of source kind:

```ts
const activeCanvas =
  templateRow
    ? { width: templateRow.image_width, height: templateRow.image_height }
    : source?.type === 'freeform' && source.canvasWidth && source.canvasHeight
      ? { width: source.canvasWidth, height: source.canvasHeight }
      : undefined
```

Every place that currently reads `templateRow.image_width` /
`image_height` purely for the percentage/coordinate math (drag, resize,
the layers-rendering block, the property bar position effect) switches to
`activeCanvas` instead. This is the single change that lets the existing
text-layer machinery — drag, resize, delete, the property bar — work
identically on a freeform canvas with no other edits to that logic.

**Container:** the template branch already renders a sized box via its
`<img>`. Freeform needs an equivalent sized box with no single image
backing it (since the background is just whichever image layer happens to
be at the bottom of the stack, or no image at all if the user deletes it).
A plain `<div>` sized via `aspectRatio: activeCanvas.width / activeCanvas.height`
and the same responsive max-height/max-width classes the template `<img>`
uses today, with `overflow: hidden` (canvas clipping) and a neutral
background (white, or the existing checkerboard-transparency look) behind
it.

**Layer rendering:** the existing `layers.map(...)` block generalizes from
`source?.type === 'template' && templateRow` to `activeCanvas !==
undefined`, unchanged otherwise for `TextLayer`. A new sibling branch
renders `ImageLayer`s as absolutely-positioned `<img>` elements using the
same percentage-of-`activeCanvas` left/top/width/height math, sharing the
same drag (`onPointerDown` → `handlePointerDown`) and resize-handle wiring
already built. Double-click on an `ImageLayer` is a no-op in Stage 1
(no edit-mode equivalent yet — crop lands in Stage 2). Delete key and the
property bar's delete button both already operate on `layerId` generically
and need no change; the property bar's font-size control, however, is
text-only — it only renders when the selected layer's `type === 'text'`.

**Canvas resize handles:** rendered when `activeCanvas` is a freeform
canvas (not a template) and nothing is selected (`selectedFieldId ===
null` doubles as "the canvas itself is the implicit selection," needing no
new selection state). Only the 3 handle positions described above
(`rm`, `bm`, `br`), positioned on the canvas container's own edges rather
than a layer's. Dragging updates `source.canvasWidth`/`canvasHeight`
directly (no coordinate-space conversion needed the way layer resize has,
since these deltas are already in the same display-scale-adjusted pixel
space `applyResizeDelta` uses) — reuses that same display-scale math, just
writes to `source` instead of a `Layer`. Clamped to a
`MIN_CANVAS_SIZE` (matching `MIN_LAYER_SIZE`'s role) so it can't be
dragged to zero or negative.

## Upload Image behavior (supersedes `d64e9c7`)

`handleImageFileSelected` changes from "set/replace the freeform
background" to "add an image layer":

- **`source === null`** (blank canvas): upload, then create a freeform
  `Source` with `canvasWidth`/`canvasHeight` set to the image's natural
  dimensions, and a single `ImageLayer` at the origin, native size,
  covering the whole canvas — same reset-supporting-state block
  (`setSavedMeta(null)`, etc.) already written for this branch.
- **`source?.type === 'freeform'`** (canvas already exists): upload, then
  append a new `ImageLayer` via `createImageLayer(src, naturalWidth,
  naturalHeight, { width: source.canvasWidth, height: source.canvasHeight })`
  to the existing `layers` array — canvas dimensions are untouched.
- **`source?.type === 'template'`**: unchanged no-op, same as today.

## Add Text unblock

`handleAddText`'s guard changes from `if (!templateRow) return` to
`if (!activeCanvas) return`, and its call to `createBlankTextLayer` uses
`activeCanvas.width`/`activeCanvas.height` instead of
`templateRow.image_width`/`image_height`. No other change — this is the
direct, expected unblock once `activeCanvas` exists for freeform.

## Explicitly out of scope for Stage 1

- **Image cropping** (Stage 2) — double-click/double-select interaction,
  crop data on `ImageLayer`, and the cropped-region rendering math are
  deferred to their own design pass.
- **Freeform export** (Stage 3) — the Export button stays disabled for
  `source?.type === 'freeform'`, exactly as it is today. Rendering mixed
  text/image layers to a PNG (and deciding how Stage 2's crop data affects
  that render) is its own design pass once Stage 1 and 2 are in.
- **Left/top-edge canvas growth**, layer z-order controls
  (bring-to-front/send-to-back — array order is the implicit z-order, same
  as today), and canvas aspect-ratio locking are all deliberately left out
  — none were asked for, and each adds real complexity YAGNI argues against
  until there's a concrete need.
- Migrating any previously-saved freeform creation's `imageUrl` field from
  `d64e9c7` — that shape was only ever live for the duration of this one
  development session, with no real saved data riding on it.

## Testing

- `layers.ts`: unit tests for `createImageLayer`'s two modes (first
  layer at native size vs. scaled-to-fit-and-centered on an existing
  canvas), and that `layersFromCanvasData` still defaults legacy
  (pre-`type`) saved layers to `'text'`.
- `EditorPage.test.tsx`: extend existing drag/resize/delete coverage to
  run against an `ImageLayer` on a freeform canvas, not just `TextLayer`s
  on a template; a new test for the canvas-resize handles (drag `br`
  grows both dimensions, layers keep their absolute `x`/`y`); a test that
  Add Text now works once a freeform canvas has `activeCanvas` set, and
  still no-ops on a truly blank one.
