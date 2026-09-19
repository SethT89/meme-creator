# Text Styling (Color, Outline, Alignment, Fonts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every text layer a working fill color, outline color (or none), left/center/right alignment, and a choice of 8 self-hosted fonts, in the on-screen editor, the PNG export, and the gallery preview.

**Architecture:** Four optional fields on `TextLayer` (`fontFamily`, `color`, `strokeColor`, `textAlign`) stored in the existing `canvas_data` JSON — no migration. One pure resolver, `resolveTextStyle`, owns every default, so the DOM renderer, the canvas exporter, and the toolbar cannot disagree; a layer with none of the fields resolves to today's exact look. Fonts come from `@fontsource/*` npm packages (latin subsets), and `renderCreationToBlob` awaits `document.fonts.load` before drawing. The toolbar gets three new small components (font, color, align pickers) with a single open-menu state in `PropertyBar`.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vitest + Testing Library (jsdom), `@fontsource/*`.

**Spec:** `docs/superpowers/specs/2026-09-18-text-styling-design.md`

**Conventions to know before starting**
- Run tests with `npx vitest run <path>`; full suite `npm run test`. Lint: `npm run lint`. Type-check + build: `npm run build`.
- Work on `main` (recent history is all direct commits). Commit after every task. **Do not push** — pushing `main` auto-deploys to production; leave that to the user.
- End every commit message with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- jsdom cannot load fonts, draw canvas, or compute `-webkit-text-stroke` — unit tests cover logic; Task 8 verifies the real thing in a browser.
- **Never verify by clicking Save** in the live app: that writes real rows to the production Supabase project. Verify Export only.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `package.json` / `package-lock.json` | modify | add 8 `@fontsource/*` deps |
| `src/lib/fonts.ts` | create | font registry (`FONT_OPTIONS`, `FontId`), system fallback stack, `getFontOption`, `fontFamilyCss` |
| `src/lib/fonts.test.ts` | create | registry sanity + guard that every font's stylesheet is imported in `src/fonts.ts` |
| `src/fonts.ts` | create | side-effect imports of the 8 `latin-<weight>.css` files |
| `src/main.tsx` | modify | `import './fonts'` |
| `src/lib/palette.ts` | create | the swatch grid (`SWATCH_ROWS`) |
| `src/lib/palette.test.ts` | create | palette sanity |
| `src/lib/layers.ts` | modify | new `TextLayer` fields, `resolveTextStyle`, `textLayerCssStyle`, `TextStylePatch`, defaults on new layers |
| `src/lib/layers.test.ts` | modify | resolver/default tests; update two existing expectations |
| `src/lib/exportCanvas.ts` | modify | draw with resolved style; await font loading |
| `src/lib/exportCanvas.test.ts` | modify | style, alignment, no-outline, font-loading tests |
| `src/features/editor/AlignPicker.tsx` | create | alignment button + dropdown |
| `src/features/editor/FontPicker.tsx` | create | font button (name in its own typeface) + dropdown |
| `src/features/editor/ColorPicker.tsx` | create | color swatch button + Fill/Outline popover |
| `src/features/editor/PropertyBar.tsx` | modify | single `openMenu` state; mount the three pickers |
| `src/features/editor/PropertyBar.test.tsx` | rewrite | existing behavior + the new controls |
| `src/features/editor/EditorPage.tsx` | modify | inline text styles on the layer box; `handleChangeTextStyle`; pass new props |
| `src/features/editor/EditorPage.test.tsx` | modify | style changes apply and persist; legacy layers unchanged |

---

### Task 1: Font registry and self-hosted font files

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/main.tsx`
- Create: `src/lib/fonts.ts`, `src/lib/fonts.test.ts`, `src/fonts.ts`

- [ ] **Step 1: Install the eight font packages**

Run:
```bash
npm install @fontsource/anton @fontsource/bebas-neue @fontsource/archivo-black @fontsource/inter @fontsource/permanent-marker @fontsource/bangers @fontsource/special-elite @fontsource/playfair-display
```
Expected: `added N packages`, no errors.

- [ ] **Step 2: Confirm the CSS files we will import exist and check the family names they declare**

Run:
```bash
ls node_modules/@fontsource/anton/latin-400.css node_modules/@fontsource/bebas-neue/latin-400.css node_modules/@fontsource/archivo-black/latin-400.css node_modules/@fontsource/inter/latin-700.css node_modules/@fontsource/permanent-marker/latin-400.css node_modules/@fontsource/bangers/latin-400.css node_modules/@fontsource/special-elite/latin-400.css node_modules/@fontsource/playfair-display/latin-700.css
grep -h "font-family" node_modules/@fontsource/anton/latin-400.css node_modules/@fontsource/bebas-neue/latin-400.css node_modules/@fontsource/archivo-black/latin-400.css node_modules/@fontsource/inter/latin-700.css node_modules/@fontsource/permanent-marker/latin-400.css node_modules/@fontsource/bangers/latin-400.css node_modules/@fontsource/special-elite/latin-400.css node_modules/@fontsource/playfair-display/latin-700.css
```
Expected: all 8 paths listed, then eight `font-family:` lines reading exactly `Anton`, `Bebas Neue`, `Archivo Black`, `Inter`, `Permanent Marker`, `Bangers`, `Special Elite`, `Playfair Display`. If any family name differs (e.g. `Inter Variable`), use the name it prints in the `family` field in Step 4.

- [ ] **Step 3: Write the failing test**

Create `src/lib/fonts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fontImports from '../fonts.ts?raw'
import { DEFAULT_FONT_ID, FONT_OPTIONS, SYSTEM_FONT_STACK, fontFamilyCss, getFontOption } from './fonts'

describe('font registry', () => {
  it('offers the eight approved fonts, Anton first', () => {
    expect(FONT_OPTIONS.map((f) => f.label)).toEqual([
      'Anton',
      'Bebas Neue',
      'Archivo Black',
      'Inter',
      'Permanent Marker',
      'Bangers',
      'Special Elite',
      'Playfair Display',
    ])
  })

  it('has unique ids, and the default font is one of them', () => {
    const ids = FONT_OPTIONS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(DEFAULT_FONT_ID)
    expect(DEFAULT_FONT_ID).toBe('anton')
  })

  it('looks a font up by id, and returns undefined for an unknown or missing id', () => {
    expect(getFontOption('bangers')?.family).toBe('Bangers')
    expect(getFontOption('nope')).toBeUndefined()
    expect(getFontOption(undefined)).toBeUndefined()
  })

  it('builds a CSS font-family with the system stack as fallback, or just the stack for no font', () => {
    expect(fontFamilyCss(getFontOption('anton'))).toBe(`"Anton", ${SYSTEM_FONT_STACK}`)
    expect(fontFamilyCss(undefined)).toBe(SYSTEM_FONT_STACK)
  })

  // Guards the wiring, not just the data: a font that is in the registry but
  // whose stylesheet was never imported would silently render in the fallback
  // font. (A stylesheet that doesn't exist can't slip through — the import in
  // src/fonts.ts would fail the build.)
  it.each(FONT_OPTIONS.map((f) => [f.id, f.weight] as const))(
    'imports the latin-%s stylesheet for weight %s in src/fonts.ts',
    (id, weight) => {
      expect(fontImports).toContain(`import '@fontsource/${id}/latin-${weight}.css'`)
    },
  )
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/lib/fonts.test.ts`
Expected: FAIL — `Cannot find module './fonts'` (or the import checks fail).

- [ ] **Step 5: Create the registry**

Create `src/lib/fonts.ts`:

```ts
// The typefaces a text layer can use. Ids double as the @fontsource package
// slug (`@fontsource/<id>`), which is what the guard test in fonts.test.ts
// relies on. Each font has ONE fixed weight — whatever looks right for memes —
// so there's no bold toggle; Inter and Playfair Display use 700 because their
// 400 is too light to read over a busy image.
export type FontId =
  | 'anton'
  | 'bebas-neue'
  | 'archivo-black'
  | 'inter'
  | 'permanent-marker'
  | 'bangers'
  | 'special-elite'
  | 'playfair-display'

export interface FontOption {
  id: FontId
  label: string
  // The exact `font-family` name declared by the font's @font-face rule.
  family: string
  weight: number
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'anton', label: 'Anton', family: 'Anton', weight: 400 },
  { id: 'bebas-neue', label: 'Bebas Neue', family: 'Bebas Neue', weight: 400 },
  { id: 'archivo-black', label: 'Archivo Black', family: 'Archivo Black', weight: 400 },
  { id: 'inter', label: 'Inter', family: 'Inter', weight: 700 },
  { id: 'permanent-marker', label: 'Permanent Marker', family: 'Permanent Marker', weight: 400 },
  { id: 'bangers', label: 'Bangers', family: 'Bangers', weight: 400 },
  { id: 'special-elite', label: 'Special Elite', family: 'Special Elite', weight: 400 },
  { id: 'playfair-display', label: 'Playfair Display', family: 'Playfair Display', weight: 700 },
]

// What every newly created text layer gets, so new text looks like a meme
// out of the box. Layers saved before fonts existed have no fontFamily and
// resolve to the system font instead (see resolveTextStyle in layers.ts).
export const DEFAULT_FONT_ID: FontId = 'anton'

// The stack the app has always used for layer text (Tailwind's default sans
// stack). Also the fallback behind every web font, and the whole font for
// legacy layers with no fontFamily.
export const SYSTEM_FONT_STACK = '-apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif'
export const SYSTEM_FONT_WEIGHT = 700

// Takes a string, not a FontId: saved canvas_data is untyped JSON, so an id
// from an older/newer build may not exist here. Unknown behaves like "none".
export function getFontOption(id: string | undefined): FontOption | undefined {
  return FONT_OPTIONS.find((f) => f.id === id)
}

export function fontFamilyCss(font: FontOption | undefined): string {
  return font ? `"${font.family}", ${SYSTEM_FONT_STACK}` : SYSTEM_FONT_STACK
}
```

- [ ] **Step 6: Create the stylesheet imports**

Create `src/fonts.ts`:

```ts
// Side-effect only. Importing a fontsource stylesheet just declares its
// @font-face rules; the browser downloads a font file the first time text in
// that family is actually rendered, so unused fonts cost nothing. Only the
// latin subsets are imported — characters outside them fall back to the
// system font. Keep this list in step with FONT_OPTIONS in lib/fonts.ts (a
// test enforces it).
import '@fontsource/anton/latin-400.css'
import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/archivo-black/latin-400.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/permanent-marker/latin-400.css'
import '@fontsource/bangers/latin-400.css'
import '@fontsource/special-elite/latin-400.css'
import '@fontsource/playfair-display/latin-700.css'
```

Modify `src/main.tsx` — add the import right after `import './index.css'`:

```ts
import './index.css'
import './fonts'
```

- [ ] **Step 7: Run tests and the build**

Run: `npx vitest run src/lib/fonts.test.ts && npm run build`
Expected: all fonts tests PASS; build succeeds and `dist/assets` contains `.woff2` files for the fonts.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/fonts.ts src/lib/fonts.test.ts src/fonts.ts src/main.tsx
git commit -m "$(cat <<'EOF'
feat: add self-hosted font registry (8 typefaces via fontsource)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Text style fields, resolver, and new-layer defaults

**Files:**
- Modify: `src/lib/layers.ts`, `src/lib/layers.test.ts`

- [ ] **Step 1: Update the two existing tests that will change, and add new failing tests**

In `src/lib/layers.test.ts`, change the import block at the top so it also brings in the new symbols. Find the existing import from `'./layers'` (it lists `initialLayersFromFields`, `layersFromCanvasData`, `createBlankTextLayer`, …) and add these names to it: `resolveTextStyle`, `textLayerCssStyle`, `OUTLINE_WIDTH_EM`, and add `TextLayer` to the type import from `'./layers'` (if there is no type import from that module, add `import type { TextLayer } from './layers'`). Add a second import: `import { SYSTEM_FONT_STACK } from './fonts'`.

In the `initialLayersFromFields` test, replace the expected array so each layer includes `fontFamily: 'anton'`:

```ts
    expect(initialLayersFromFields(mockFields)).toEqual([
      { type: 'text', id: 'f1', label: 'Caption 1', x: 30, y: 50, width: 220, height: 110, fontSize: 22, heightAuto: true, fontFamily: 'anton' },
      { type: 'text', id: 'f2', label: 'Caption 2', x: 310, y: 70, width: 220, height: 110, fontSize: 22, heightAuto: true, fontFamily: 'anton' },
    ])
```

In the `createBlankTextLayer` first test, add after `expect(layer.heightAuto).toBe(true)`:

```ts
    expect(layer.fontFamily).toBe('anton')
```

In `layersFromCanvasData`, in the test `'defaults heightAuto and type to their text-layer defaults for saved layers from before those fields existed'`, add before its closing brace:

```ts
    // Saved before fonts existed: stays on the legacy system font, not Anton.
    expect((layer as TextLayer).fontFamily).toBeUndefined()
```

Append this new `describe` block at the end of the file:

```ts
describe('resolveTextStyle', () => {
  const base: TextLayer = { type: 'text', id: 't', label: '', x: 0, y: 0, width: 10, height: 10, fontSize: 20, heightAuto: true }

  it("resolves a layer with none of the style fields to today's exact look (system bold, white, black outline, centered)", () => {
    expect(resolveTextStyle(base)).toEqual({
      fontId: null,
      fontFamily: SYSTEM_FONT_STACK,
      fontWeight: 700,
      color: '#ffffff',
      strokeColor: '#000000',
      textAlign: 'center',
    })
  })

  it('resolves a chosen font to its family (with the system stack as fallback) and fixed weight', () => {
    const style = resolveTextStyle({ ...base, fontFamily: 'inter' })
    expect(style.fontId).toBe('inter')
    expect(style.fontFamily).toBe(`"Inter", ${SYSTEM_FONT_STACK}`)
    expect(style.fontWeight).toBe(700)
    expect(resolveTextStyle({ ...base, fontFamily: 'bangers' }).fontWeight).toBe(400)
  })

  it('treats an unknown saved font id like no font (legacy look) instead of crashing', () => {
    const style = resolveTextStyle({ ...base, fontFamily: 'gone-font' as unknown as TextLayer['fontFamily'] })
    expect(style.fontId).toBeNull()
    expect(style.fontFamily).toBe(SYSTEM_FONT_STACK)
  })

  it('applies color and textAlign overrides independently', () => {
    expect(resolveTextStyle({ ...base, color: '#ff0000' }).color).toBe('#ff0000')
    expect(resolveTextStyle({ ...base, textAlign: 'left' }).textAlign).toBe('left')
    expect(resolveTextStyle({ ...base, textAlign: 'left' }).color).toBe('#ffffff')
  })

  it('distinguishes "no outline" (null) from "never set" (undefined → black)', () => {
    expect(resolveTextStyle({ ...base, strokeColor: null }).strokeColor).toBeNull()
    expect(resolveTextStyle({ ...base, strokeColor: '#00ff00' }).strokeColor).toBe('#00ff00')
    expect(resolveTextStyle({ ...base }).strokeColor).toBe('#000000')
  })
})

describe('textLayerCssStyle', () => {
  const base: TextLayer = { type: 'text', id: 't', label: '', x: 0, y: 0, width: 10, height: 10, fontSize: 20, heightAuto: true }

  it('turns a resolved style into the inline CSS the on-screen layer box uses', () => {
    expect(textLayerCssStyle({ ...base, fontFamily: 'anton', color: '#ff0000', strokeColor: '#0000ff', textAlign: 'right' })).toEqual({
      fontFamily: `"Anton", ${SYSTEM_FONT_STACK}`,
      fontWeight: 400,
      color: '#ff0000',
      textAlign: 'right',
      WebkitTextStroke: `${OUTLINE_WIDTH_EM}em #0000ff`,
    })
  })

  it('drops the stroke entirely when the outline is none', () => {
    expect(textLayerCssStyle({ ...base, strokeColor: null }).WebkitTextStroke).toBe('0')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/layers.test.ts`
Expected: FAIL — the new imports are undefined, and the updated expectations fail.

- [ ] **Step 3: Implement**

In `src/lib/layers.ts`, add at the very top of the file (above `interface BaseLayer`):

```ts
import { DEFAULT_FONT_ID, SYSTEM_FONT_WEIGHT, fontFamilyCss, getFontOption } from './fonts'
import type { FontId } from './fonts'
```

Add `TextAlign` and extend `TextLayer`. Replace the existing `TextLayer` interface with:

```ts
export type TextAlign = 'left' | 'center' | 'right'

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
  // The four style fields below are all optional so that every creation
  // saved before they existed still loads and renders exactly as it did:
  // read them ONLY through resolveTextStyle, which owns the defaults.
  fontFamily?: FontId
  // Fill color, '#rrggbb'.
  color?: string
  // Outline color, '#rrggbb'. null means no outline; undefined means "never
  // set", which resolves to black (the original look) — the two differ.
  strokeColor?: string | null
  textAlign?: TextAlign
}
```

Add directly after the `Layer` type alias (`export type Layer = TextLayer | ImageLayer`):

```ts
export const DEFAULT_TEXT_COLOR = '#ffffff'
export const DEFAULT_STROKE_COLOR = '#000000'
// Outline thickness as a fraction of the font size. In `em` on screen (so it
// scales with the container-query font size) and multiplied by the font size
// in the canvas exporter, so both draw the same stroke.
export const OUTLINE_WIDTH_EM = 0.24

export interface ResolvedTextStyle {
  // null = legacy system font (no/unknown fontFamily on the layer).
  fontId: FontId | null
  // A ready-to-use CSS font-family value, fallback stack included.
  fontFamily: string
  fontWeight: number
  color: string
  strokeColor: string | null
  textAlign: TextAlign
}

export type TextStylePatch = Partial<Pick<TextLayer, 'fontFamily' | 'color' | 'strokeColor' | 'textAlign'>>

// The single place text-style defaults live. The on-screen box, the canvas
// exporter and the toolbar all read a layer through this, so they cannot
// disagree about what an unstyled (legacy) layer looks like.
export function resolveTextStyle(layer: TextLayer): ResolvedTextStyle {
  const font = getFontOption(layer.fontFamily)
  return {
    fontId: font?.id ?? null,
    fontFamily: fontFamilyCss(font),
    fontWeight: font?.weight ?? SYSTEM_FONT_WEIGHT,
    color: layer.color ?? DEFAULT_TEXT_COLOR,
    strokeColor: layer.strokeColor === undefined ? DEFAULT_STROKE_COLOR : layer.strokeColor,
    textAlign: layer.textAlign ?? 'center',
  }
}

// Inline CSS for a text layer's on-screen box. paint-order (stroke behind
// fill, so the outline doesn't thin the letterforms) stays a class in
// EditorPage since it never varies.
export function textLayerCssStyle(layer: TextLayer) {
  const style = resolveTextStyle(layer)
  return {
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    color: style.color,
    textAlign: style.textAlign,
    WebkitTextStroke: style.strokeColor ? `${OUTLINE_WIDTH_EM}em ${style.strokeColor}` : '0',
  }
}
```

In `initialLayersFromFields`, add `fontFamily: DEFAULT_FONT_ID,` after `heightAuto: true,`. In `createBlankTextLayer`, add `fontFamily: DEFAULT_FONT_ID,` after `heightAuto: true,`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/layers.test.ts`
Expected: PASS (all, including the untouched existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/layers.ts src/lib/layers.test.ts
git commit -m "$(cat <<'EOF'
feat: add text style fields and resolver to text layers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Color palette

**Files:**
- Create: `src/lib/palette.ts`, `src/lib/palette.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/palette.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SWATCH_ROWS } from './palette'
import { DEFAULT_STROKE_COLOR, DEFAULT_TEXT_COLOR } from './layers'

describe('SWATCH_ROWS', () => {
  const all = SWATCH_ROWS.flat()

  it('is two rows: 11 saturated swatches over 10 tints (the 11th slot in row two is the custom-color wheel)', () => {
    expect(SWATCH_ROWS.map((row) => row.length)).toEqual([11, 10])
  })

  it('uses lowercase #rrggbb hex, with unique hexes and unique names', () => {
    for (const swatch of all) expect(swatch.hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(all.map((s) => s.hex)).size).toBe(all.length)
    expect(new Set(all.map((s) => s.name)).size).toBe(all.length)
  })

  it("includes today's default fill and outline colors, so they show as selected on an unstyled layer", () => {
    const hexes = all.map((s) => s.hex)
    expect(hexes).toContain(DEFAULT_TEXT_COLOR)
    expect(hexes).toContain(DEFAULT_STROKE_COLOR)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/palette.test.ts`
Expected: FAIL — `Cannot find module './palette'`.

- [ ] **Step 3: Implement**

Create `src/lib/palette.ts`:

```ts
export interface Swatch {
  name: string
  hex: string
}

// Modeled on the FigJam swatch grid: a row of saturated colors (black and
// white at the ends) over a row of matching tints. A custom-color wheel sits
// after the last tint in the UI. Names double as the swatch buttons' accessible
// labels. Black/white are exactly the default outline/fill so an unstyled
// layer shows them as selected.
export const SWATCH_ROWS: Swatch[][] = [
  [
    { name: 'Black', hex: '#000000' },
    { name: 'Gray', hex: '#757575' },
    { name: 'Red', hex: '#e2553a' },
    { name: 'Orange', hex: '#f4a259' },
    { name: 'Yellow', hex: '#fbcd5b' },
    { name: 'Green', hex: '#86d380' },
    { name: 'Teal', hex: '#7fd6cb' },
    { name: 'Blue', hex: '#5fa8fa' },
    { name: 'Purple', hex: '#8452f6' },
    { name: 'Pink', hex: '#e65bbd' },
    { name: 'White', hex: '#ffffff' },
  ],
  [
    { name: 'Silver', hex: '#b3b3b3' },
    { name: 'Light gray', hex: '#d9d9d9' },
    { name: 'Light red', hex: '#f7c9c4' },
    { name: 'Light orange', hex: '#fbe0c6' },
    { name: 'Light yellow', hex: '#fdefc4' },
    { name: 'Light green', hex: '#d7f3d9' },
    { name: 'Light teal', hex: '#d1f7f3' },
    { name: 'Light blue', hex: '#c9e2fd' },
    { name: 'Light purple', hex: '#dccdfb' },
    { name: 'Light pink', hex: '#f5c8e9' },
  ],
]
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/palette.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/palette.ts src/lib/palette.test.ts
git commit -m "$(cat <<'EOF'
feat: add text color swatch palette

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Export renders the resolved style and waits for fonts

**Files:**
- Modify: `src/lib/exportCanvas.ts`, `src/lib/exportCanvas.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/exportCanvas.test.ts`, add to the imports at the top:

```ts
import { SYSTEM_FONT_STACK } from './fonts'
```

Then append this `describe` block at the end of the file (it defines its own helpers, since `mockContext`/`stubCanvas` are local to the earlier `describe`):

```ts
describe('renderCreationToBlob text styling', () => {
  function styledContext() {
    const calls: { method: string; args: unknown[] }[] = []
    const ctx = {
      drawImage: (...args: unknown[]) => calls.push({ method: 'drawImage', args }),
      strokeText: (...args: unknown[]) => calls.push({ method: 'strokeText', args }),
      fillText: (...args: unknown[]) => calls.push({ method: 'fillText', args }),
      measureText: (text: string) => ({ width: text.length * 10, fontBoundingBoxAscent: 16, fontBoundingBoxDescent: 4 }),
      font: '',
      textAlign: '',
      textBaseline: '',
      lineWidth: 0,
      strokeStyle: '',
      fillStyle: '',
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
      cb(new Blob(['fake'], { type: 'image/png' }))
    })
    return { ctx, calls }
  }

  // x=10, width=100, jsdom display width 0 → scale 1 → 4px padding:
  // left anchor 14, center 60, right 106.
  const layer = (over: Partial<Extract<Layer, { type: 'text' }>> = {}): Layer => ({
    type: 'text',
    id: 't1',
    label: 'hi',
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    fontSize: 22,
    heightAuto: true,
    ...over,
  })
  const render = (layers: Layer[]) =>
    renderCreationToBlob(document.createElement('div'), { image_width: 600, image_height: 908 }, layers)

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'fonts')
  })

  it("draws a layer with no style fields exactly as before: system bold, white fill, black outline, centered", async () => {
    const { ctx, calls } = styledContext()
    await render([layer()])

    expect(ctx.font).toBe(`700 22px ${SYSTEM_FONT_STACK}`)
    expect(ctx.fillStyle).toBe('#ffffff')
    expect(ctx.strokeStyle).toBe('#000000')
    expect(ctx.textAlign).toBe('center')
    expect(calls.find((c) => c.method === 'fillText')?.args[1]).toBe(60)
  })

  it("uses the layer's font, fill color and outline color", async () => {
    const { ctx, calls } = styledContext()
    await render([layer({ fontFamily: 'anton', color: '#ff0000', strokeColor: '#00ff00' })])

    expect(ctx.font).toBe(`400 22px "Anton", ${SYSTEM_FONT_STACK}`)
    expect(ctx.fillStyle).toBe('#ff0000')
    expect(ctx.strokeStyle).toBe('#00ff00')
    expect(calls.some((c) => c.method === 'strokeText')).toBe(true)
  })

  it('skips the outline entirely when strokeColor is null', async () => {
    const { calls } = styledContext()
    await render([layer({ strokeColor: null })])

    expect(calls.some((c) => c.method === 'strokeText')).toBe(false)
    expect(calls.some((c) => c.method === 'fillText')).toBe(true)
  })

  it.each([
    ['left', 14],
    ['center', 60],
    ['right', 106],
  ] as const)('aligns %s by anchoring the text at x=%s', async (textAlign, anchorX) => {
    const { ctx, calls } = styledContext()
    await render([layer({ textAlign })])

    expect(ctx.textAlign).toBe(textAlign)
    expect(calls.find((c) => c.method === 'fillText')?.args[1]).toBe(anchorX)
  })

  it('waits for every web font used by a text layer to load before drawing anything', async () => {
    const { calls } = styledContext()
    let release!: () => void
    const load = vi.fn(() => new Promise<FontFace[]>((resolve) => (release = () => resolve([]))))
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })

    const pending = render([layer({ fontFamily: 'anton', label: 'hello' })])

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(expect.stringContaining('"Anton"'), 'hello')
    expect(calls.some((c) => c.method === 'fillText')).toBe(false)

    release()
    await pending
    expect(calls.some((c) => c.method === 'fillText')).toBe(true)
  })

  it('loads each distinct font once, and skips legacy layers that use no web font', async () => {
    styledContext()
    const load = vi.fn(() => Promise.resolve([] as FontFace[]))
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })

    await render([layer({ id: 'a', fontFamily: 'bangers' }), layer({ id: 'b', fontFamily: 'bangers' }), layer({ id: 'c' })])

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(expect.stringContaining('"Bangers"'), expect.any(String))
  })

  it('still exports (in the fallback font) if a font fails to load', async () => {
    const { calls } = styledContext()
    const load = vi.fn(() => Promise.reject(new Error('network')))
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })

    await render([layer({ fontFamily: 'anton' })])

    expect(calls.some((c) => c.method === 'fillText')).toBe(true)
  })
})
```

Also update the first import line of that test file to include `afterEach`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/exportCanvas.test.ts`
Expected: FAIL — new tests fail (`ctx.font` still `bold …`, no alignment/anchor logic, `load` never called).

- [ ] **Step 3: Implement**

In `src/lib/exportCanvas.ts`:

Replace the first two lines of imports and the `FONT_FAMILY` constant block. The top of the file currently reads:

```ts
import { getCropRect } from './layers'
import type { ImageLayer, Layer, TextLayer } from './layers'

// Matches this app's real on-screen CSS font stack (Tailwind's default
// sans stack — confirmed live via getComputedStyle on an actual layer
// box), not the generic 'sans-serif' keyword. Different fallback fonts
// have different glyph metrics, which shifts both word-wrap points and
// text width/positioning.
const FONT_FAMILY = '-apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif'
```

Replace it with:

```ts
import { OUTLINE_WIDTH_EM, getCropRect, resolveTextStyle } from './layers'
import type { ImageLayer, Layer, ResolvedTextStyle, TextLayer } from './layers'
```

Delete the line `const STROKE_RATIO = 0.24` (keep the `LINE_HEIGHT_RATIO` and `CSS_PADDING_PX` constants and their comments).

Add these two functions directly above `drawLayer`'s leading comment (`// Stroke before fill, mirroring the CSS ...`):

```ts
// The canvas font shorthand for a resolved style — the same weight/size/
// family the on-screen box uses, so glyph metrics (and so word-wrap points)
// match. Also the string document.fonts.load() needs to know which face to fetch.
export function textFontShorthand(style: ResolvedTextStyle, fontSize: number): string {
  return `${style.fontWeight} ${fontSize}px ${style.fontFamily}`
}

// A canvas silently draws in the fallback font if a web font hasn't finished
// loading yet (the browser only fetches a face once something renders in it,
// and a picker preview or the on-screen box may not have). So before drawing,
// explicitly load each distinct web font the text layers use. A failed load
// must not block the export — the meme just comes out in the fallback font,
// which beats an export button that does nothing on a flaky connection.
async function ensureFontsLoaded(layers: Layer[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const textByFont = new Map<string, string>()
  for (const layer of layers) {
    if (layer.type !== 'text') continue
    const style = resolveTextStyle(layer)
    if (!style.fontId) continue // legacy system font: nothing to fetch
    // Size is irrelevant to which face loads; a fixed one dedupes the layers.
    const spec = textFontShorthand(style, 16)
    textByFont.set(spec, (textByFont.get(spec) ?? '') + layer.label)
  }
  await Promise.all([...textByFont].map(([spec, text]) => document.fonts.load(spec, text || ' ').catch(() => [])))
}
```

Replace the whole `drawLayer` function (from `function drawLayer(` through its closing `}` just before the `// crossOrigin is required` comment) with:

```ts
function drawLayer(ctx: CanvasRenderingContext2D, layer: TextLayer, scale: number) {
  const style = resolveTextStyle(layer)
  ctx.font = textFontShorthand(style, layer.fontSize)
  ctx.textAlign = style.textAlign
  ctx.textBaseline = 'alphabetic'
  ctx.lineWidth = layer.fontSize * OUTLINE_WIDTH_EM
  ctx.fillStyle = style.color
  if (style.strokeColor) ctx.strokeStyle = style.strokeColor

  const padding = CSS_PADDING_PX * scale
  const lines = wrapTextLines(ctx, layer.label, layer.width - padding * 2)
  const lineHeight = layer.fontSize * LINE_HEIGHT_RATIO
  // CSS text-align positions text relative to the box's padding edges, so
  // left/right anchor at the padding, not the raw box edge.
  const anchorX =
    style.textAlign === 'left'
      ? layer.x + padding
      : style.textAlign === 'right'
        ? layer.x + layer.width - padding
        : layer.x + layer.width / 2

  lines.forEach((line, i) => {
    const lineTop = layer.y + padding + i * lineHeight
    // Canvas's textBaseline positions the glyph's own baseline, not the
    // top of its line box the way CSS line-height does — CSS instead
    // centers the glyph within the line box (font ascent/descent) and
    // pads the rest as "half-leading" above and below it. Reproducing
    // that placement (rather than just pinning the glyph to the very top
    // of the line, which sits visibly higher than the CSS original) needs
    // the font's actual measured ascent/descent for this exact font/size
    // — falls back to a reasonable fixed ratio on the rare browser that
    // doesn't support these TextMetrics fields.
    const metrics = ctx.measureText(line)
    const ascent = metrics.fontBoundingBoxAscent ?? layer.fontSize * 0.8
    const descent = metrics.fontBoundingBoxDescent ?? layer.fontSize * 0.2
    const halfLeading = Math.max(0, (lineHeight - (ascent + descent)) / 2)
    const baselineY = lineTop + halfLeading + ascent
    if (style.strokeColor) ctx.strokeText(line, anchorX, baselineY)
    ctx.fillText(line, anchorX, baselineY)
  })
}
```

In `renderCreationToBlob`, add the font wait right after the `if (!ctx) throw ...` line:

```ts
  await ensureFontsLoaded(layers)
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/exportCanvas.test.ts`
Expected: PASS — the new tests and all the pre-existing export tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/exportCanvas.ts src/lib/exportCanvas.test.ts
git commit -m "$(cat <<'EOF'
feat: export draws each text layer's font, colors and alignment

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: AlignPicker

**Files:**
- Create: `src/features/editor/AlignPicker.tsx`, `src/features/editor/AlignPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/editor/AlignPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AlignPicker } from './AlignPicker'

describe('AlignPicker', () => {
  it('renders a button and keeps its options hidden until open', () => {
    render(<AlignPicker value="center" open={false} onToggle={() => {}} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Text alignment' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('calls onToggle when the button is clicked', async () => {
    const onToggle = vi.fn()
    render(<AlignPicker value="center" open={false} onToggle={onToggle} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Text alignment' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('lists left/center/right when open, with the current one checked', () => {
    render(<AlignPicker value="right" open onToggle={() => {}} onChange={() => {}} />)
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((el) => el.textContent)).toEqual(['Align left', 'Align center', 'Align right'])
    expect(screen.getByRole('menuitemradio', { name: 'Align right' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'Align left' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange with the chosen alignment', async () => {
    const onChange = vi.fn()
    render(<AlignPicker value="center" open onToggle={() => {}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Align left' }))
    expect(onChange).toHaveBeenCalledWith('left')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/editor/AlignPicker.test.tsx`
Expected: FAIL — `Cannot find module './AlignPicker'`.

- [ ] **Step 3: Implement**

Create `src/features/editor/AlignPicker.tsx`:

```tsx
import type { TextAlign } from '../../lib/layers'

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: 'left', label: 'Align left' },
  { value: 'center', label: 'Align center' },
  { value: 'right', label: 'Align right' },
]

// Three stacked lines of different lengths, pushed to the left, middle or
// right edge — the usual alignment glyph.
function AlignIcon({ align }: { align: TextAlign }) {
  const widths = [14, 9, 12]
  return (
    <svg aria-hidden="true" width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {widths.map((width, i) => {
        const start = align === 'left' ? 0 : align === 'center' ? (14 - width) / 2 : 14 - width
        const y = 2 + i * 4
        return <line key={i} x1={start + 0.75} x2={start + width - 0.75} y1={y} y2={y} />
      })}
    </svg>
  )
}

interface AlignPickerProps {
  value: TextAlign
  open: boolean
  onToggle: () => void
  onChange: (value: TextAlign) => void
}

export function AlignPicker({ value, open, onToggle, onChange }: AlignPickerProps) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Text alignment"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center rounded-full px-2 py-1.5"
        onClick={onToggle}
      >
        <AlignIcon align={value} />
      </button>
      {open && (
        <div role="menu" aria-label="Text alignment options" className="absolute bottom-full left-1/2 mb-2 w-40 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
          {ALIGN_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-neutral-700 ${
                option.value === value ? 'bg-neutral-800' : ''
              }`}
              onClick={() => onChange(option.value)}
            >
              <AlignIcon align={option.value} />
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/features/editor/AlignPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/AlignPicker.tsx src/features/editor/AlignPicker.test.tsx
git commit -m "$(cat <<'EOF'
feat: add text alignment picker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: FontPicker

**Files:**
- Create: `src/features/editor/FontPicker.tsx`, `src/features/editor/FontPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/editor/FontPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FontPicker } from './FontPicker'
import { SYSTEM_FONT_STACK } from '../../lib/fonts'

const anton = { fontId: 'anton' as const, fontFamily: `"Anton", ${SYSTEM_FONT_STACK}`, fontWeight: 400 }
const legacy = { fontId: null, fontFamily: SYSTEM_FONT_STACK, fontWeight: 700 }

describe('FontPicker', () => {
  it("shows the current typeface's name, set in that typeface", () => {
    render(<FontPicker {...anton} open={false} onToggle={() => {}} onChange={() => {}} />)
    const button = screen.getByRole('button', { name: 'Font: Anton' })
    expect(button).toHaveTextContent('Anton')
    expect(button.style.fontFamily).toContain('Anton')
  })

  it('shows "System" for a legacy layer with no chosen font', () => {
    render(<FontPicker {...legacy} open={false} onToggle={() => {}} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Font: System' })).toBeInTheDocument()
  })

  it('keeps the list hidden until open, and calls onToggle on click', async () => {
    const onToggle = vi.fn()
    render(<FontPicker {...anton} open={false} onToggle={onToggle} onChange={() => {}} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Font: Anton' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('lists all eight fonts when open, each name set in its own typeface, current one checked', () => {
    render(<FontPicker {...anton} open onToggle={() => {}} onChange={() => {}} />)
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((el) => el.textContent)).toEqual([
      'Anton',
      'Bebas Neue',
      'Archivo Black',
      'Inter',
      'Permanent Marker',
      'Bangers',
      'Special Elite',
      'Playfair Display',
    ])
    expect(screen.getByRole('menuitemradio', { name: 'Bangers' }).style.fontFamily).toContain('Bangers')
    expect(screen.getByRole('menuitemradio', { name: 'Anton' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: 'Bangers' })).toHaveAttribute('aria-checked', 'false')
  })

  it('checks nothing for a legacy layer', () => {
    render(<FontPicker {...legacy} open onToggle={() => {}} onChange={() => {}} />)
    for (const item of screen.getAllByRole('menuitemradio')) expect(item).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange with the font id', async () => {
    const onChange = vi.fn()
    render(<FontPicker {...anton} open onToggle={() => {}} onChange={onChange} />)
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Bebas Neue' }))
    expect(onChange).toHaveBeenCalledWith('bebas-neue')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/editor/FontPicker.test.tsx`
Expected: FAIL — `Cannot find module './FontPicker'`.

- [ ] **Step 3: Implement**

Create `src/features/editor/FontPicker.tsx`:

```tsx
import { FONT_OPTIONS, fontFamilyCss, getFontOption } from '../../lib/fonts'
import type { FontId } from '../../lib/fonts'

interface FontPickerProps {
  // null = a legacy layer on the system font (no chosen typeface).
  fontId: FontId | null
  // The layer's resolved CSS font-family/weight, so the button previews the
  // typeface that is actually applied.
  fontFamily: string
  fontWeight: number
  open: boolean
  onToggle: () => void
  onChange: (id: FontId) => void
}

export function FontPicker({ fontId, fontFamily, fontWeight, open, onToggle, onChange }: FontPickerProps) {
  const label = getFontOption(fontId ?? undefined)?.label ?? 'System'

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Font: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        // The name is set in its own typeface so the current choice is
        // legible at a glance — that's the point of this control.
        style={{ fontFamily, fontWeight }}
        className="max-w-36 truncate rounded-full px-2 py-1 text-sm"
        onClick={onToggle}
      >
        {label}
      </button>
      {open && (
        <div role="menu" aria-label="Fonts" className="absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
          {FONT_OPTIONS.map((font) => (
            <button
              key={font.id}
              type="button"
              role="menuitemradio"
              aria-checked={font.id === fontId}
              style={{ fontFamily: fontFamilyCss(font), fontWeight: font.weight }}
              className={`block w-full rounded-md px-2 py-1.5 text-left text-base hover:bg-neutral-700 ${
                font.id === fontId ? 'bg-neutral-800' : ''
              }`}
              onClick={() => onChange(font.id)}
            >
              {font.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/features/editor/FontPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/FontPicker.tsx src/features/editor/FontPicker.test.tsx
git commit -m "$(cat <<'EOF'
feat: add font picker that previews each typeface in itself

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: ColorPicker (Fill / Outline tabs)

**Files:**
- Create: `src/features/editor/ColorPicker.tsx`, `src/features/editor/ColorPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/editor/ColorPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColorPicker } from './ColorPicker'
import { SWATCH_ROWS } from '../../lib/palette'

const hexOf = (name: string) => SWATCH_ROWS.flat().find((s) => s.name === name)!.hex

function renderPicker(props: Partial<ComponentProps<typeof ColorPicker>> = {}) {
  const onChange = vi.fn()
  render(<ColorPicker color="#ffffff" strokeColor="#000000" open onToggle={() => {}} onChange={onChange} {...props} />)
  return { onChange }
}

describe('ColorPicker', () => {
  it('shows a swatch of the current fill color on its button, and keeps the popover hidden until open', () => {
    render(<ColorPicker color="#ff0000" strokeColor="#000000" open={false} onToggle={() => {}} onChange={() => {}} />)
    const button = screen.getByRole('button', { name: 'Text color' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button.querySelector('span')?.style.backgroundColor).toBe('rgb(255, 0, 0)')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls onToggle when the button is clicked', async () => {
    const onToggle = vi.fn()
    render(<ColorPicker color="#ffffff" strokeColor="#000000" open={false} onToggle={onToggle} onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('opens on the Fill tab, with the current fill swatch marked selected', () => {
    renderPicker({ color: '#ffffff' })
    expect(screen.getByRole('tab', { name: 'Fill' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders every swatch in both rows', () => {
    renderPicker()
    for (const swatch of SWATCH_ROWS.flat()) expect(screen.getByRole('button', { name: swatch.name })).toBeInTheDocument()
  })

  it('picking a swatch on the Fill tab changes the fill color', async () => {
    const { onChange } = renderPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Red' }))
    expect(onChange).toHaveBeenCalledWith({ color: hexOf('Red') })
  })

  it('the Outline tab marks the current outline swatch and picking one changes the outline color', async () => {
    const { onChange } = renderPicker({ strokeColor: '#000000' })
    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Blue' }))
    expect(onChange).toHaveBeenCalledWith({ strokeColor: hexOf('Blue') })
  })

  it('has a None option only on the Outline tab, which turns the outline off', async () => {
    const { onChange } = renderPicker()
    expect(screen.queryByRole('button', { name: 'None' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(onChange).toHaveBeenCalledWith({ strokeColor: null })
  })

  it('shows None as pressed and no swatch selected when the outline is off', async () => {
    renderPicker({ strokeColor: null })
    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    expect(screen.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true')
    for (const swatch of SWATCH_ROWS.flat()) {
      expect(screen.getByRole('button', { name: swatch.name })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it("routes the custom color wheel to the active tab's property", async () => {
    const { onChange } = renderPicker()
    fireEvent.change(screen.getByLabelText('Custom color'), { target: { value: '#123456' } })
    expect(onChange).toHaveBeenLastCalledWith({ color: '#123456' })

    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    fireEvent.change(screen.getByLabelText('Custom color'), { target: { value: '#654321' } })
    expect(onChange).toHaveBeenLastCalledWith({ strokeColor: '#654321' })
  })

  it('leaves the popover open after picking a color, so fill and outline can be set in a row', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Red' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/editor/ColorPicker.test.tsx`
Expected: FAIL — `Cannot find module './ColorPicker'`.

- [ ] **Step 3: Implement**

Create `src/features/editor/ColorPicker.tsx`:

```tsx
import { useState } from 'react'
import { SWATCH_ROWS } from '../../lib/palette'
import type { TextStylePatch } from '../../lib/layers'

type Tab = 'fill' | 'outline'

interface ColorPickerProps {
  color: string
  // null = the outline is off.
  strokeColor: string | null
  open: boolean
  onToggle: () => void
  onChange: (patch: Pick<TextStylePatch, 'color' | 'strokeColor'>) => void
}

const SWATCH_BASE = 'h-5 w-5 shrink-0 rounded-full border'

export function ColorPicker({ color, strokeColor, open, onToggle, onChange }: ColorPickerProps) {
  const [tab, setTab] = useState<Tab>('fill')
  // The swatch to ring: the fill in the Fill tab, the outline (if any) in the
  // Outline tab.
  const selected = (tab === 'fill' ? color : strokeColor)?.toLowerCase() ?? null

  function apply(hex: string) {
    onChange(tab === 'fill' ? { color: hex } : { strokeColor: hex })
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Text color"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center rounded-full px-2 py-1.5"
        onClick={onToggle}
      >
        <span aria-hidden="true" className="block h-4 w-4 rounded-full border border-neutral-500" style={{ backgroundColor: color }} />
      </button>
      {open && (
        <div role="dialog" aria-label="Text color" className="absolute bottom-full left-1/2 mb-2 w-max -translate-x-1/2 rounded-xl bg-neutral-900 p-3 shadow-lg">
          <div className="mb-3 flex items-center gap-2 border-b border-neutral-700 pb-2">
            <div role="tablist" className="flex gap-1">
              {(['fill', 'outline'] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={tab === name}
                  className={`rounded-md px-2.5 py-1 text-sm ${tab === name ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
                  onClick={() => setTab(name)}
                >
                  {name === 'fill' ? 'Fill' : 'Outline'}
                </button>
              ))}
            </div>
            {tab === 'outline' && (
              <button
                type="button"
                aria-pressed={strokeColor === null}
                className={`ml-auto rounded-md px-2.5 py-1 text-sm ${strokeColor === null ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
                onClick={() => onChange({ strokeColor: null })}
              >
                None
              </button>
            )}
          </div>

          {SWATCH_ROWS.map((row, rowIndex) => (
            <div key={rowIndex} className="mb-1 flex gap-1 last:mb-0">
              {row.map((swatch) => {
                const isSelected = selected === swatch.hex
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    aria-label={swatch.name}
                    aria-pressed={isSelected}
                    className={`${SWATCH_BASE} ${isSelected ? 'border-transparent ring-2 ring-white ring-offset-1 ring-offset-neutral-900' : 'border-neutral-600'}`}
                    style={{ backgroundColor: swatch.hex }}
                    onClick={() => apply(swatch.hex)}
                  />
                )
              })}
              {/* The rainbow "custom color" swatch, last in the tint row: a
                  native color input stretched invisibly over it, so clicking
                  it opens the browser's own picker. */}
              {rowIndex === SWATCH_ROWS.length - 1 && (
                <label
                  className={`${SWATCH_BASE} relative cursor-pointer overflow-hidden border-neutral-600`}
                  style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                >
                  <input
                    type="color"
                    aria-label="Custom color"
                    value={selected ?? '#000000'}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={(e) => apply(e.currentTarget.value)}
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/features/editor/ColorPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/ColorPicker.tsx src/features/editor/ColorPicker.test.tsx
git commit -m "$(cat <<'EOF'
feat: add fill/outline color picker with a None outline option

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wire the pickers into PropertyBar

**Files:**
- Modify: `src/features/editor/PropertyBar.tsx`
- Rewrite: `src/features/editor/PropertyBar.test.tsx`

- [ ] **Step 1: Rewrite the test file (existing behavior + new controls)**

Replace the whole contents of `src/features/editor/PropertyBar.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyBar } from './PropertyBar'
import { resolveTextStyle } from '../../lib/layers'
import type { TextLayer } from '../../lib/layers'
import { SWATCH_ROWS } from '../../lib/palette'

const textLayer: TextLayer = { type: 'text', id: 't', label: '', x: 0, y: 0, width: 10, height: 10, fontSize: 36, heightAuto: true, fontFamily: 'anton' }
const textStyle = resolveTextStyle(textLayer)

// A text layer's bar: every text prop supplied, each overridable per test.
function renderTextBar(props: Partial<ComponentProps<typeof PropertyBar>> = {}) {
  const onChangeTextStyle = vi.fn()
  const onChangeFontSize = vi.fn()
  render(
    <PropertyBar
      fontSize={36}
      onChangeFontSize={onChangeFontSize}
      textStyle={textStyle}
      onChangeTextStyle={onChangeTextStyle}
      onDelete={() => {}}
      onReorder={() => {}}
      canMoveForward
      canMoveBackward
      {...props}
    />,
  )
  return { onChangeTextStyle, onChangeFontSize }
}

describe('PropertyBar', () => {
  it('shows the current size as a preset name when it matches one exactly', () => {
    renderTextBar()
    expect(screen.getByText(/size: medium/i)).toBeInTheDocument()
  })

  it('shows the current size as a raw px label when it matches no preset', () => {
    renderTextBar({ fontSize: 22 })
    expect(screen.getByText(/size: 22px/i)).toBeInTheDocument()
  })

  it("clicking a preset calls onChangeFontSize with that preset's px value and closes the panel", async () => {
    const { onChangeFontSize } = renderTextBar()

    await userEvent.click(screen.getByText(/size: medium/i))
    await userEvent.click(screen.getByText('Large'))

    expect(onChangeFontSize).toHaveBeenCalledWith(48)
    expect(screen.queryByText('Extra Large')).not.toBeInTheDocument()
  })

  it('typing a custom size and pressing Enter calls onChangeFontSize with the clamped value', async () => {
    const { onChangeFontSize } = renderTextBar()

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)
    await userEvent.type(input, '9999{enter}')

    expect(onChangeFontSize).toHaveBeenCalledWith(300)
  })

  it('updates live as you type a custom size, before any blur or Enter', async () => {
    const { onChangeFontSize } = renderTextBar()

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)
    await userEvent.type(input, '50')

    // No blur, no Enter — the on-canvas preview should already reflect it.
    expect(onChangeFontSize).toHaveBeenCalledWith(50)
  })

  it('does not fire on an empty (in-progress) custom size value', async () => {
    const { onChangeFontSize } = renderTextBar()

    await userEvent.click(screen.getByText(/size: medium/i))
    const input = screen.getByLabelText(/custom font size/i)
    await userEvent.clear(input)

    // Clearing the field to type a fresh number shouldn't flash the
    // on-canvas text down to the minimum size in the meantime.
    expect(onChangeFontSize).not.toHaveBeenCalled()
  })

  it('clicking Delete calls onDelete', async () => {
    const onDelete = vi.fn()
    renderTextBar({ onDelete })

    await userEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('renders without any text controls when it is an image layer (no text props), but still shows Delete', () => {
    render(<PropertyBar onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)
    expect(screen.queryByRole('button', { name: /^font/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/size:/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Text color' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Text alignment' })).not.toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('Delete still works when text controls are hidden', async () => {
    const onDelete = vi.fn()
    render(<PropertyBar onDelete={onDelete} onReorder={() => {}} canMoveForward canMoveBackward />)

    await userEvent.click(screen.getByText('Delete'))

    expect(onDelete).toHaveBeenCalled()
  })

  it('shows font, color and alignment controls alongside size for a text layer', () => {
    renderTextBar()
    expect(screen.getByRole('button', { name: 'Font: Anton' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Text color' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Text alignment' })).toBeInTheDocument()
  })

  it('shows no Crop button when onCrop is not provided (a text layer)', () => {
    renderTextBar()
    expect(screen.queryByText('Crop')).not.toBeInTheDocument()
  })

  it('shows a Crop button when onCrop is provided (an image layer), and clicking it calls onCrop', async () => {
    const onCrop = vi.fn()
    render(<PropertyBar onCrop={onCrop} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)

    const cropButton = screen.getByText('Crop')
    expect(cropButton).toBeInTheDocument()
    await userEvent.click(cropButton)

    expect(onCrop).toHaveBeenCalled()
  })

  describe('font, color and alignment', () => {
    it("shows the current font's name in that font, and \"System\" for a legacy layer", () => {
      const { unmount } = render(
        <PropertyBar fontSize={36} onChangeFontSize={() => {}} textStyle={textStyle} onChangeTextStyle={() => {}} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />,
      )
      expect(screen.getByRole('button', { name: 'Font: Anton' }).style.fontFamily).toContain('Anton')
      unmount()

      const legacyStyle = resolveTextStyle({ ...textLayer, fontFamily: undefined })
      renderTextBar({ textStyle: legacyStyle })
      expect(screen.getByRole('button', { name: 'Font: System' })).toBeInTheDocument()
    })

    it('choosing a font sends it as a style patch and closes the list', async () => {
      const { onChangeTextStyle } = renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Font: Anton' }))
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Bebas Neue' }))

      expect(onChangeTextStyle).toHaveBeenCalledWith({ fontFamily: 'bebas-neue' })
      expect(screen.queryByRole('menu', { name: 'Fonts' })).not.toBeInTheDocument()
    })

    it('choosing an alignment sends it as a style patch and closes the menu', async () => {
      const { onChangeTextStyle } = renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Text alignment' }))
      await userEvent.click(screen.getByRole('menuitemradio', { name: 'Align right' }))

      expect(onChangeTextStyle).toHaveBeenCalledWith({ textAlign: 'right' })
      expect(screen.queryByRole('menu', { name: 'Text alignment options' })).not.toBeInTheDocument()
    })

    it('picking a fill color sends it as a style patch and leaves the popover open', async () => {
      const { onChangeTextStyle } = renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
      await userEvent.click(screen.getByRole('button', { name: 'Red' }))

      const red = SWATCH_ROWS.flat().find((s) => s.name === 'Red')!.hex
      expect(onChangeTextStyle).toHaveBeenCalledWith({ color: red })
      expect(screen.getByRole('dialog', { name: 'Text color' })).toBeInTheDocument()
    })

    it('turning the outline off sends strokeColor: null', async () => {
      const { onChangeTextStyle } = renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
      await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
      await userEvent.click(screen.getByRole('button', { name: 'None' }))

      expect(onChangeTextStyle).toHaveBeenCalledWith({ strokeColor: null })
    })

    it('only ever has one menu open: opening another closes the current one', async () => {
      renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Font: Anton' }))
      expect(screen.getByRole('menu', { name: 'Fonts' })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
      expect(screen.queryByRole('menu', { name: 'Fonts' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Text color' })).toBeInTheDocument()

      await userEvent.click(screen.getByText(/size: medium/i))
      expect(screen.queryByRole('dialog', { name: 'Text color' })).not.toBeInTheDocument()
      expect(screen.getByLabelText(/custom font size/i)).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))
      expect(screen.queryByLabelText(/custom font size/i)).not.toBeInTheDocument()
      expect(screen.getAllByRole('menuitem')).toHaveLength(4)
    })

    it('clicking an open menu\'s own button closes it', async () => {
      renderTextBar()
      await userEvent.click(screen.getByRole('button', { name: 'Text alignment' }))
      expect(screen.getByRole('menu', { name: 'Text alignment options' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Text alignment' }))
      expect(screen.queryByRole('menu', { name: 'Text alignment options' })).not.toBeInTheDocument()
    })
  })

  describe('Layering', () => {
    function renderBar(props: { canMoveForward?: boolean; canMoveBackward?: boolean } = {}) {
      const onReorder = vi.fn()
      render(<PropertyBar onDelete={() => {}} onReorder={onReorder} canMoveForward={props.canMoveForward ?? true} canMoveBackward={props.canMoveBackward ?? true} />)
      return onReorder
    }

    it('shows a Layering button, with its options hidden until clicked', async () => {
      renderBar()
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))

      expect(screen.getAllByRole('menuitem').map((el) => el.textContent?.replace(/[⌘⇧[\]]/g, ''))).toEqual([
        'Bring to front',
        'Bring forward',
        'Send backward',
        'Send to back',
      ])
    })

    it.each([
      ['Bring to front', 'front'],
      ['Bring forward', 'forward'],
      ['Send backward', 'backward'],
      ['Send to back', 'back'],
    ])('clicking %s calls onReorder(%s) and closes the menu', async (name, action) => {
      const onReorder = renderBar()
      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))

      await userEvent.click(screen.getByRole('menuitem', { name: new RegExp(name, 'i') }))

      expect(onReorder).toHaveBeenCalledWith(action)
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    })

    it('disables the forward/front options when the layer is already on top', async () => {
      const onReorder = renderBar({ canMoveForward: false })
      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))

      expect(screen.getByRole('menuitem', { name: /bring to front/i })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: /bring forward/i })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: /send backward/i })).toBeEnabled()
      expect(screen.getByRole('menuitem', { name: /send to back/i })).toBeEnabled()

      await userEvent.click(screen.getByRole('menuitem', { name: /bring forward/i }))
      expect(onReorder).not.toHaveBeenCalled()
    })

    it('disables the backward/back options when the layer is already at the bottom', async () => {
      renderBar({ canMoveBackward: false })
      await userEvent.click(screen.getByRole('button', { name: 'Layering' }))

      expect(screen.getByRole('menuitem', { name: /send backward/i })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: /send to back/i })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: /bring forward/i })).toBeEnabled()
    })

    it("shows Layering on an image layer's toolbar too", () => {
      render(<PropertyBar onCrop={() => {}} onDelete={() => {}} onReorder={() => {}} canMoveForward canMoveBackward />)
      expect(screen.getByRole('button', { name: 'Layering' })).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/editor/PropertyBar.test.tsx`
Expected: FAIL — `PropertyBar` doesn't accept `textStyle`/`onChangeTextStyle` yet and doesn't render the new controls (TypeScript errors surface as failing tests / missing buttons).

- [ ] **Step 3: Implement**

Replace the entire contents of `src/features/editor/PropertyBar.tsx` with:

```tsx
import { useState } from 'react'
import { SIZE_PRESETS, clampFontSize, sizeLabel } from '../../lib/layers'
import type { ReorderAction, ResolvedTextStyle, TextStylePatch } from '../../lib/layers'
import { AlignPicker } from './AlignPicker'
import { ColorPicker } from './ColorPicker'
import { FontPicker } from './FontPicker'

interface PropertyBarProps {
  // The four props below are present for a text layer and omitted for an
  // image layer — the Font/Size/Color/Align controls only render when all
  // four are given.
  fontSize?: number
  onChangeFontSize?: (px: number) => void
  textStyle?: ResolvedTextStyle
  onChangeTextStyle?: (patch: TextStylePatch) => void
  // Present for an image layer, omitted for a text layer — the Crop
  // button only renders when given.
  onCrop?: () => void
  onDelete: () => void
  // Layering applies to every object, so unlike the props above these are
  // never optional. The can* flags come from the layer's position in the
  // stack: an entry that would change nothing is shown but disabled.
  onReorder: (action: ReorderAction) => void
  canMoveForward: boolean
  canMoveBackward: boolean
}

// Order matches the dropdown top-to-bottom. `needs` is which direction the
// layer must still be able to move for the entry to do anything. Hints are
// the keyboard shortcuts wired up in EditorPage.
const LAYERING_OPTIONS: { action: ReorderAction; label: string; hint: string; needs: 'forward' | 'backward' }[] = [
  { action: 'front', label: 'Bring to front', hint: '⌘⇧]', needs: 'forward' },
  { action: 'forward', label: 'Bring forward', hint: '⌘]', needs: 'forward' },
  { action: 'backward', label: 'Send backward', hint: '⌘[', needs: 'backward' },
  { action: 'back', label: 'Send to back', hint: '⌘⇧[', needs: 'backward' },
]

type MenuName = 'font' | 'size' | 'color' | 'align' | 'layering'

const DIVIDER = <div className="h-4 w-px bg-neutral-700" />

export function PropertyBar({
  fontSize,
  onChangeFontSize,
  textStyle,
  onChangeTextStyle,
  onCrop,
  onDelete,
  onReorder,
  canMoveForward,
  canMoveBackward,
}: PropertyBarProps) {
  // One menu open at a time: opening any menu replaces whichever was open.
  const [openMenu, setOpenMenu] = useState<MenuName | null>(null)
  const toggleMenu = (name: MenuName) => setOpenMenu((current) => (current === name ? null : name))

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
    // flex-wrap + a viewport-relative max width: on a narrow screen the
    // (now wider) bar wraps onto a second row instead of running off-screen.
    <div className="flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-1 rounded-3xl bg-neutral-900 px-2 py-1.5 text-white shadow-lg">
      {fontSize !== undefined && onChangeFontSize !== undefined && textStyle !== undefined && onChangeTextStyle !== undefined && (
        <>
          <FontPicker
            fontId={textStyle.fontId}
            fontFamily={textStyle.fontFamily}
            fontWeight={textStyle.fontWeight}
            open={openMenu === 'font'}
            onToggle={() => toggleMenu('font')}
            onChange={(id) => {
              onChangeTextStyle({ fontFamily: id })
              setOpenMenu(null)
            }}
          />
          {DIVIDER}

          <div className="relative">
            <button type="button" className="rounded-full px-2 py-1 text-xs" onClick={() => toggleMenu('size')}>
              Size: {sizeLabel(fontSize)}
            </button>
            {openMenu === 'size' && (
              <div className="absolute bottom-full left-1/2 mb-2 w-40 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
                {SIZE_PRESETS.map((preset) => (
                  <div
                    key={preset.label}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-sm hover:bg-neutral-700"
                    onClick={() => {
                      onChangeFontSize(preset.px)
                      setOpenMenu(null)
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
                        setOpenMenu(null)
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          {DIVIDER}

          <ColorPicker
            color={textStyle.color}
            strokeColor={textStyle.strokeColor}
            open={openMenu === 'color'}
            onToggle={() => toggleMenu('color')}
            onChange={onChangeTextStyle}
          />
          <AlignPicker
            value={textStyle.textAlign}
            open={openMenu === 'align'}
            onToggle={() => toggleMenu('align')}
            onChange={(textAlign) => {
              onChangeTextStyle({ textAlign })
              setOpenMenu(null)
            }}
          />
          {DIVIDER}
        </>
      )}

      {onCrop && (
        <>
          <button type="button" className="rounded-full px-2 py-1 text-xs" onClick={onCrop}>
            Crop
          </button>
          {DIVIDER}
        </>
      )}

      <div className="relative">
        <button
          type="button"
          className="rounded-full px-2 py-1 text-xs"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'layering'}
          onClick={() => toggleMenu('layering')}
        >
          Layering
        </button>
        {openMenu === 'layering' && (
          <div role="menu" className="absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded-lg bg-neutral-900 p-1.5 shadow-lg">
            {LAYERING_OPTIONS.map((option) => (
              <button
                key={option.action}
                type="button"
                role="menuitem"
                disabled={!(option.needs === 'forward' ? canMoveForward : canMoveBackward)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-neutral-700 disabled:cursor-default disabled:text-neutral-500 disabled:hover:bg-transparent"
                onClick={() => {
                  onReorder(option.action)
                  setOpenMenu(null)
                }}
              >
                {option.label}
                <span aria-hidden="true" className="ml-3 text-xs text-neutral-400">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {DIVIDER}
      <button type="button" className="rounded-full px-2 py-1 text-xs text-red-400" onClick={onDelete}>
        Delete
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/features/editor/PropertyBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/editor/PropertyBar.tsx src/features/editor/PropertyBar.test.tsx
git commit -m "$(cat <<'EOF'
feat: add font, color and alignment controls to the property bar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Apply the styles on the editor canvas

**Files:**
- Modify: `src/features/editor/EditorPage.tsx`, `src/features/editor/EditorPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/features/editor/EditorPage.test.tsx`, insert these tests immediately before the existing test `it('deleting the selected box removes it from the canvas', ...)`:

```tsx
  it('changing the fill color updates the selected box on screen', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
    await userEvent.click(screen.getByRole('button', { name: 'Red' }))

    expect(screen.getByText('Caption 1')).toHaveStyle({ color: '#e2553a' })
    // ...and only that box.
    expect(screen.getByText('Caption 2')).toHaveStyle({ color: '#ffffff' })
  })

  it('changing the font and alignment updates the selected box, and both persist on save', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByRole('button', { name: 'Font: Anton' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Bangers' }))
    await userEvent.click(screen.getByRole('button', { name: 'Text alignment' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Align left' }))

    const box = screen.getByText('Caption 1')
    expect(box.style.fontFamily).toContain('Bangers')
    expect(box).toHaveStyle({ textAlign: 'left' })

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    const saved = savedRows.at(-1) as { canvas_data?: { layers?: { id: string; fontFamily?: string; textAlign?: string }[] } }
    const savedField1 = saved.canvas_data?.layers?.find((l) => l.id === 'f1')
    expect(savedField1?.fontFamily).toBe('bangers')
    expect(savedField1?.textAlign).toBe('left')
  })

  it('turning the outline off is remembered as strokeColor null in the saved layer', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    await userEvent.click(screen.getByRole('button', { name: 'Text color' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }))
    await userEvent.click(screen.getByRole('button', { name: 'None' }))

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    const saved = savedRows.at(-1) as { canvas_data?: { layers?: { id: string; strokeColor?: string | null }[] } }
    expect(saved.canvas_data?.layers?.find((l) => l.id === 'f1')?.strokeColor).toBeNull()
  })

  it('new text and template captions start in Anton, white with a black outline, centered', async () => {
    renderEditor()
    await userEvent.click(await screen.findByText('Two Buttons'))
    await userEvent.click(screen.getByText('Caption 1'))

    expect(screen.getByRole('button', { name: 'Font: Anton' })).toBeInTheDocument()
    expect(screen.getByText('Caption 1').style.fontFamily).toContain('Anton')
    expect(screen.getByText('Caption 1')).toHaveStyle({ color: '#ffffff', textAlign: 'center' })
  })

  it('a creation saved before text styling existed reopens looking exactly as it did (system font, white, centered)', async () => {
    savedRows.push({
      id: 'legacy-style-1',
      name: 'Old Meme',
      tags: [],
      source_type: 'template',
      template_id: 'tmpl-1',
      canvas_data: { layers: [{ type: 'text', id: 'f1', label: 'Old caption', x: 30, y: 50, width: 220, height: 110, fontSize: 22, heightAuto: true }] },
    })

    renderEditor('/editor/legacy-style-1')
    const box = await screen.findByText('Old caption')

    expect(box.style.fontFamily).not.toContain('Anton')
    expect(box).toHaveStyle({ color: '#ffffff', textAlign: 'center', fontWeight: '700' })

    await userEvent.click(box)
    expect(screen.getByRole('button', { name: 'Font: System' })).toBeInTheDocument()
  })
```

Also, in the existing test `'selecting an image layer shows Delete and Crop in the property bar but no Font/Size/Color control'`, add after `expect(screen.queryByText('Color')).not.toBeInTheDocument()`:

```tsx
      expect(screen.queryByRole('button', { name: 'Text color' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Text alignment' })).not.toBeInTheDocument()
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/editor/EditorPage.test.tsx`
Expected: FAIL — the text controls don't appear (EditorPage doesn't pass `textStyle`/`onChangeTextStyle`), and the box still has the hard-coded classes.

- [ ] **Step 3: Implement**

In `src/features/editor/EditorPage.tsx`:

(a) Extend the layers import. In the value import from `'../../lib/layers'`, add `resolveTextStyle,` and `textLayerCssStyle,` (e.g. after `layerClipPath,`). In the type import on the next line, add `TextStylePatch`:

```ts
import type { Layer, TextLayer, ImageLayer, ImageBounds, ResizeSign, ReorderAction, TextStylePatch } from '../../lib/layers'
```

(b) Add the handler directly after `handleChangeFontSize`:

```ts
  function handleChangeTextStyle(layerId: string, patch: TextStylePatch) {
    setLayers((prev) => prev.map((l) => (l.id === layerId && l.type === 'text' ? { ...l, ...patch } : l)))
  }
```

(c) In the layer box, replace the comment + className that hard-codes the meme-text look. Find:

```tsx
                          // White fill + black outline (classic meme-text look) —
                          // legible regardless of what's underneath. Stroke width
                          // in em so it scales with this box's own font-size
                          // (itself already scaled to the image via cqw, see
                          // fontSize below) without a second scaling calc.
                          // paint-order draws the stroke behind the fill so it
                          // doesn't eat into/thin the white letterforms.
                          className={`absolute p-1 text-center font-bold text-white outline-none [-webkit-text-stroke:0.24em_black] [paint-order:stroke_fill] ${
```

Replace with:

```tsx
                          // Font, fill, outline and alignment come from the
                          // layer's own style (textLayerCssStyle in the style
                          // prop below); an unstyled legacy layer resolves to
                          // the original white-fill/black-outline/centered look.
                          // The outline is an em-sized -webkit-text-stroke so it
                          // scales with this box's own font-size (itself already
                          // scaled to the image via cqw). paint-order draws the
                          // stroke behind the fill so it doesn't eat into/thin
                          // the letterforms.
                          className={`absolute p-1 outline-none [paint-order:stroke_fill] ${
```

Then in the same element's `style={{ ... }}`, add `...textLayerCssStyle(layer),` on the line directly after the `left`/`top`/`width` entries — i.e. immediately before the `// heightAuto (the default): ...` comment:

```tsx
                            width: `${widthPct}%`,
                            ...textLayerCssStyle(layer),
```

(d) Pass the new props to `PropertyBar`. Find:

```tsx
                              onChangeFontSize={layer.type === 'text' ? (px) => handleChangeFontSize(layer.id, px) : undefined}
```

and add directly after it:

```tsx
                              textStyle={layer.type === 'text' ? resolveTextStyle(layer) : undefined}
                              onChangeTextStyle={layer.type === 'text' ? (patch) => handleChangeTextStyle(layer.id, patch) : undefined}
```

- [ ] **Step 4: Run to verify pass, then the whole suite**

Run: `npx vitest run src/features/editor/EditorPage.test.tsx`
Expected: PASS.

Run: `npm run test`
Expected: entire suite PASS. If an unrelated pre-existing test fails because it asserted the old class names (`text-center`, `font-bold`, `text-white`) or `bold` in a font string, update that assertion to the resolved-style equivalent — do not weaken it.

- [ ] **Step 5: Lint and type-check**

Run: `npm run lint && npm run build`
Expected: no lint errors; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/EditorPage.tsx src/features/editor/EditorPage.test.tsx
git commit -m "$(cat <<'EOF'
feat: apply per-layer font, color, outline and alignment on the canvas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Verify in a real browser

jsdom can't load fonts or draw canvas, so this is where fonts, the export, and the wider toolbar are actually proven. **Do not click Save** (writes real production rows). Use Export only.

**Files:** none (verification only; fixes go back into the earlier tasks' files).

- [ ] **Step 1: Start the app**

If `.claude/launch.json` defines a dev server, use `preview_start` with its name; otherwise use the dev server already running at `http://localhost:5173` (do not kill it if the user has it open). Confirm no console errors (`read_console_messages` with `onlyErrors`).

- [ ] **Step 2: Fonts render on screen**

Pick the "Two Buttons" template, click a caption. Open the Font menu; screenshot it. Expected: 8 entries, each name drawn in its own typeface (Anton condensed, Bangers comic, Permanent Marker handwritten, Special Elite typewriter, Playfair serif, etc.), and the toolbar's font button shows "Anton" in Anton. Pick each font in turn and confirm the caption on the canvas changes. Check in the network log (`read_network_requests`, filter `woff2`) that font files load from the app's own origin, not `fonts.googleapis.com`/`gstatic`.

- [ ] **Step 3: Color, outline, alignment on screen**

Open the color popover. Set Fill to Yellow, Outline tab → Blue, then None (outline disappears), then Black again. Use the rainbow wheel to pick a custom color. Set alignment left/center/right (widen the box first by dragging its resize handle so alignment is visible). Confirm each change is reflected immediately and the toolbar stays on screen with only one menu open at a time.

- [ ] **Step 4: Export matches the screen**

Style two captions differently (e.g. Caption 1: Bangers, yellow, blue outline, left; Caption 2: Playfair Display, white, no outline, right). Then capture the export without downloading it. In `javascript_tool`, run:

```js
window.__exported = null
const realCreate = URL.createObjectURL.bind(URL)
URL.createObjectURL = (b) => { if (b instanceof Blob && b.type === 'image/png') window.__exported = b; return realCreate(b) }
HTMLAnchorElement.prototype.click = function () {} // swallow the download itself
```

Click **Export** (More options menu). Then run:

```js
await new Promise((r) => setTimeout(r, 1500))
const url = URL.createObjectURL(window.__exported)
document.body.insertAdjacentHTML('beforeend', `<img id="__exp" src="${url}" style="position:fixed;inset:0;z-index:99999;max-height:100vh;background:#888">`)
```

Screenshot it, compare against the on-screen editor: same fonts, colors, outline (or none), alignment, and wrap points. Remove the overlay with `document.getElementById('__exp').remove()`. If Export delivers via the share sheet instead (mobile-emulated), skip this and report it. If a font renders in the fallback face in the PNG, the font-load wait isn't working — fix in `exportCanvas.ts` before continuing.

- [ ] **Step 5: A pre-existing creation is unchanged**

Open the gallery (`/gallery`) and open any existing saved creation (do not modify or save it). Expected: its text looks exactly as it always did (system bold, white, black outline, centered), and selecting a caption shows "Font: System" in the toolbar.

- [ ] **Step 6: The toolbar on a phone-width screen**

`resize_window` to `mobile` (375×812) and reload. Select a caption. Expected: the toolbar wraps within the viewport rather than running off-screen; the color popover (~290px wide) is fully visible and all swatches are tappable. If the bar or a popover is clipped at the left/right edge because the caption sits near a screen edge, note exactly which cases in the report — a viewport-clamped position for the whole property bar is a **known follow-up** for the broader mobile pass (the user has not yet reviewed most of the app on mobile), not part of this plan. Reset with `resize_window` preset `desktop` afterward.

- [ ] **Step 7: Report**

Summarize what was verified with the screenshots, list anything that failed or was skipped, and list the mobile issues found for the follow-up pass. If a fix was needed, make it in the relevant file, re-run `npm run test`, and commit it separately (`fix: …`).

---

### Task 11: Wrap-up notes

**Files:**
- Create: `/Users/seththomas/.claude/projects/-Users-seththomas-Desktop-Claude-Projects-Meme-Creator/memory/text-styling.md`
- Modify: `/Users/seththomas/.claude/projects/-Users-seththomas-Desktop-Claude-Projects-Meme-Creator/memory/MEMORY.md`

- [ ] **Step 1: Write the memory note**

Create `text-styling.md` with frontmatter (`name: text-styling`, `description`, `metadata: {type: project}`) recording: what shipped (fill/outline/none, alignment, 8 self-hosted fonts via `@fontsource`, ids double as package slugs, Anton default for new text, legacy layers = system bold), the design gotchas actually hit during verification (Task 10 findings), that fonts must be awaited before canvas export (`ensureFontsLoaded`), that adding a font = `npm install @fontsource/<slug>` + one line each in `src/lib/fonts.ts` and `src/fonts.ts` (a test guards this), and the open mobile follow-up (toolbar/popover positioning at phone width; user says most of the app hasn't been reviewed on mobile). Link `[[canvas-export]]`, `[[editor-canvas-interactions]]`.

- [ ] **Step 2: Add the index line to `MEMORY.md`**

Append one line: `- [Text styling](text-styling.md) — fill/outline/align/8 self-hosted fonts shipped; how to add a font; mobile toolbar pass still open`

- [ ] **Step 3: Final state check**

Run: `git status --short && git log --oneline | head -12`
Expected: clean working tree apart from the untracked `Images/Random_Images/`; the commits from Tasks 1–9 (plus any Task 10 fixes) on top of `00b24cb`. **Do not push** — tell the user the branch is ready and that pushing `main` deploys to production.
