# Text Styling (Color, Outline, Alignment, Fonts) — Design

## Overview

Text layers today are hard-coded: white fill, black outline, bold, centered,
in the system font stack. The only per-layer style is `fontSize`. The
property bar (`PropertyBar.tsx`) has a dead "Font" label and a dead "Color"
label next to the working Size control.

This adds four per-layer text controls, modeled on the FigJam / Figma text
toolbars the user supplied as references:

1. **Fill color** — swatch popover, tab "Fill".
2. **Outline color, or none** — same popover, tab "Outline", with a "None"
   option.
3. **Text alignment** — left / center / right.
4. **Font family** — a curated list of 8 self-hosted typefaces.

Out of scope (YAGNI, can be added later): bold/italic toggles, outline
thickness, line spacing, vertical alignment, per-word styling, gradients,
undo/redo, a broader/searchable font catalog.

## Data model

`TextLayer` (`src/lib/layers.ts`) gains four **optional** fields, stored in
the creation's `canvas_data` JSON alongside the existing ones. No database
migration — `canvas_data` is already free-form JSON.

```ts
fontFamily?: FontId        // key into FONT_OPTIONS; undefined = legacy system bold
color?: string             // fill, hex like '#ffffff'; undefined = '#ffffff'
strokeColor?: string | null // outline hex; null = no outline; undefined = '#000000'
textAlign?: 'left' | 'center' | 'right' // undefined = 'center'
```

Optional on purpose: every creation already saved has none of these, and
must load and export exactly as it looks today (system bold font, white
fill, black outline, centered). A single pure resolver,
`resolveTextStyle(layer)`, fills the defaults and is the **only** place the
defaults live, so the DOM renderer and the export renderer cannot disagree.

**New layers get an explicit font.** `createBlankTextLayer` and
`initialLayersFromFields` (template-seeded captions) set
`fontFamily: 'anton'`, so new text looks like a meme out of the box. Only
layers loaded from older saved data keep the legacy look. (Decision to
confirm: template-seeded captions such as Two Buttons' also switch to Anton
for new sessions. Saved creations are unaffected.) `hasUnsavedLayerEdits()`
compares against the seeded baseline built by the same functions, so the
"discard work?" prompt is unaffected.

## Font registry

New `src/lib/fonts.ts`:

```ts
export const FONT_OPTIONS = [
  { id: 'anton',            label: 'Anton',            family: 'Anton',            weight: 400 },
  { id: 'bebas-neue',       label: 'Bebas Neue',       family: 'Bebas Neue',       weight: 400 },
  { id: 'archivo-black',    label: 'Archivo Black',    family: 'Archivo Black',    weight: 400 },
  { id: 'inter',            label: 'Inter',            family: 'Inter',            weight: 700 },
  { id: 'permanent-marker', label: 'Permanent Marker', family: 'Permanent Marker', weight: 400 },
  { id: 'bangers',          label: 'Bangers',          family: 'Bangers',          weight: 400 },
  { id: 'special-elite',    label: 'Special Elite',    family: 'Special Elite',    weight: 400 },
  { id: 'playfair-display', label: 'Playfair Display', family: 'Playfair Display', weight: 700 },
]
```

Each font has one fixed weight (what looks right for memes); there is no
bold toggle, so the old always-bold goes away. The legacy system stack
remains available only as the resolved fallback for old layers and is not
shown in the picker.

**Hosting: self-hosted via `@fontsource/*` npm packages**, not runtime Google
Fonts links and not system fonts. The user never uploads or installs a font
file; it is eight `npm install` lines. Reasons: works identically on every
device (Impact/Comic Sans do not), no third-party requests at page load, and
the export path can reliably wait for a font to be ready.

- Import only the `latin-<weight>.css` files, once, in `src/main.tsx` (or a
  small `src/fonts.ts` it imports). Importing declares the `@font-face`
  rules only; the browser downloads a font file the first time text using it
  is rendered, so unused fonts cost nothing. Vite fingerprints and emits the
  files into `dist`, and Cloudflare Pages serves them from the app's own
  domain.
- Non-Latin characters fall back to the system font. Acceptable for v1.

## Property bar

Order, left to right: **Font ▾ · Size ▾ · Color ▾ · Align ▾ · | Crop (image
layers) · Layering ▾ · Delete**. Font/Size/Color/Align render only for text
layers, as Font/Size do today. The dead "Font" and "Color" labels are
replaced by the real controls.

- **Font button** shows the current typeface's *name rendered in that
  typeface* (per user request), so the choice is legible at a glance. The
  dropdown lists all 8, each name set in its own typeface, current one
  checked. Legacy layers show "System". Opening the dropdown is what first
  triggers downloading the fonts for their previews.
- **Size** is unchanged.
- **Color button** is a round swatch of the current fill (like FigJam's).
  Its popover has two tabs, **Fill** and **Outline**. Both show the same
  swatch grid: two rows of 10 hues/tints plus white, and a rainbow "custom"
  swatch backed by a native `<input type="color">` for arbitrary colors. The
  Outline tab adds a **None** option (equivalent to `strokeColor: null`);
  picking any swatch there turns the outline back on. The selected swatch is
  ringed. Outline thickness is fixed at today's 0.24em.
- **Align button** shows the current alignment icon; the dropdown offers
  left / center / right.
- Only one popover is open at a time (a single `openMenu` state replaces the
  separate `panelOpen` / `layeringOpen` booleans), and opening one closes
  the others.
- New callbacks mirror `onChangeFontSize`: `onChangeTextStyle(patch)` taking a
  `Partial<Pick<TextLayer, 'fontFamily' | 'color' | 'strokeColor' | 'textAlign'>>`,
  handled in `EditorPage` by one generic `handleChangeTextStyle(layerId,
  patch)` next to `handleChangeFontSize`.

## Rendering

**On screen (`EditorPage.tsx`).** The Tailwind classes `text-center
font-bold text-white [-webkit-text-stroke:0.24em_black]` move to inline
styles derived from `resolveTextStyle`: `fontFamily`, `fontWeight`, `color`,
`textAlign`, and `WebkitTextStroke` (`0.24em <color>`, or `0` when none).
`paint-order: stroke fill` stays as a class. The stroke stays in `em` so it
scales with the cqw-scaled font size, as it does now.

**Export and gallery preview (`exportCanvas.ts`).** `drawLayer` reads the same
resolved style:
- `ctx.font` is the font's weight, the font size in px, then the quoted
  family, with the system stack as fallback (e.g. `400 48px "Anton", -apple-system, ...`).
- `ctx.fillStyle = color`; `strokeText` is skipped when the outline is none;
  otherwise `strokeStyle = strokeColor`.
- `ctx.textAlign` follows `textAlign`, with the draw anchor x set to the
  box's left padding edge, center, or right padding edge respectively.
- Line-height stays at the existing 1.5 ratio, and the half-leading logic
  keeps using measured font ascent/descent, so it adapts to each font's
  metrics.

**Font readiness.** `renderCreationToBlob` — the single function both Export
and Save's preview render go through — first awaits
`document.fonts.load(font, text)` for every distinct font used by a text
layer, guarded so it is a no-op where `document.fonts` is absent (jsdom).
Without this, a canvas silently draws in the fallback font if the face has
not loaded yet.

Known accepted difference: canvas word-wrap is a greedy approximation of the
browser's wrapping (already documented in `wrapTextLines`); different fonts
may occasionally wrap one word differently between the editor and the
export. Same class of gap as today, verified visually per font.

## Save / load

No schema change. `handleSave` already serializes `layers` into
`canvas_data`; the new fields ride along. `layersFromCanvasData` needs no
migration code because absent fields resolve to legacy defaults. Reopening
a saved creation whose layers use a font relies on the browser downloading
that face on first render — no explicit preload needed for on-screen text.

## Testing

Unit (Vitest, mocking the way the codebase already does):
- `resolveTextStyle`: legacy layer (all undefined) → today's exact style;
  each field overriding independently; `strokeColor: null` vs `undefined`.
- `createBlankTextLayer` / `initialLayersFromFields` set `fontFamily: 'anton'`.
- `layersFromCanvasData` still loads a layer saved without the new fields.
- `exportCanvas`: font string per font, fill/stroke colors, stroke skipped
  when none, `textAlign` and anchor x for left/center/right, and
  `document.fonts.load` awaited before drawing (fake ctx + fake
  `document.fonts`).
- `PropertyBar`: Fill/Outline tabs, None option, picking a swatch calls
  `onChangeStyle` with the right patch, font button renders in its typeface
  (inline `fontFamily`), align dropdown, only one popover open at a time,
  controls hidden for image layers.
- `EditorPage`: a selected text layer's style updates the layer's inline
  styles.

Live browser verification (jsdom cannot load fonts or draw): pick each of
the 8 fonts and confirm on-screen text, then Export and confirm the PNG
uses the same font; check alignment and outline-none in the export; reopen
a creation saved before this change and confirm it looks unchanged; check
the wider toolbar at a 320px viewport (it now has more controls, and is
portaled and centered over the layer, so it may need to wrap or scroll to
stay on screen).

## Risks

- **Toolbar width.** Four controls plus Layering/Delete is wider than
  today's bar; on narrow screens it can run off-screen. Mitigation to
  verify: allow the bar to wrap, or clamp its position to the viewport.
- **Font metric drift** between DOM and canvas per font — mitigated by
  measuring real ascent/descent and verifying each of the 8 visually.
- **Bundle/asset size** — mitigated by latin-only subsets and on-demand
  download.
