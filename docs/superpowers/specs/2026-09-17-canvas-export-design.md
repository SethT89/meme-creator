# Canvas Export (Download / Share) — Design

## Overview

Make the Editor's "Export" button (currently a permanently-disabled
placeholder) actually render the current template-based creation to a PNG
and deliver it to the user — as a browser download on desktop, or via the
native OS share sheet on mobile. This is a local-only operation: it does
**not** write anything to Supabase (no `exported_image_url`, no
`creation-exports` upload). Persisting an exported image to the gallery is
explicitly out of scope — Save / Save As already handle persistence, and
wiring `exported_image_url` is a separate future task.

Scope is limited to `source?.type === 'template'` creations. Freeform
creations have no working background/layer editing yet (see
[[infra-setup]] remaining sub-projects), so Export stays disabled there,
same as today.

## Rendering approach

Draw onto an **off-screen `<canvas>`**, not a DOM-screenshot library
(html2canvas / dom-to-image). Reason: the app's meme-text style uses CSS
`-webkit-text-stroke` (white fill, black outline — see
[[editor-polish-and-layout-containment]]), which screenshot libraries
notoriously render badly or drop entirely. A canvas 2D `strokeText` +
`fillText` pair reproduces the same visual technique directly (stroke
first, fill on top, matching the CSS `paint-order: stroke fill`), and
avoids adding a new dependency. This also matches the original app spec's
own note that the editor should be "Canvas-based (for clean compositing
and export)."

**Resolution:** the canvas is sized to the template's real pixel
dimensions (`templateRow.image_width` × `templateRow.image_height`), not
the on-screen display size. Every `Layer`'s `x/y/width/height/fontSize` is
already stored in that same real-pixel coordinate space (confirmed in
`src/lib/layers.ts` — the on-screen editor just displays it scaled down via
CSS percentages), so layers draw onto the export canvas at their stored
values with no scaling math needed. This automatically satisfies the
original spec's "match source image resolution" guidance.

**Per-layer drawing (approximating the current CSS look):**
- `ctx.textAlign = 'center'`, bold sans-serif font at `layer.fontSize`px.
- Stroke width `layer.fontSize * 0.24` (mirrors the CSS `0.24em` stroke),
  black, drawn via `strokeText` before white `fillText` — same paint order
  as the CSS `paint-order: stroke fill`.
- Manual word-wrap: canvas has no automatic wrapping, so a small
  `measureText`-based line-breaker splits `layer.label` into lines that
  fit `layer.width`, mirroring (not pixel-identical to) the browser's own
  wrapping. Lines are drawn top-down from `layer.y`, each advancing by
  `fontSize * 1.2` (approximates default line-height) — matches the
  existing DOM behavior of starting at the top of the box, not vertically
  centering.
- This is an accepted approximation, not a guarantee of pixel-parity with
  the live DOM editor — line-break points and exact font metrics may
  differ slightly from what's on screen. Visual style (stroke/fill/weight)
  should match closely.

**CORS:** the template `<img>` needs `crossOrigin="anonymous"` added so
`canvas.toBlob()` doesn't throw for a "tainted" canvas. The
`template-images` Supabase storage bucket is public with open policies
(confirmed in `supabase/migrations/20260914214950_init.sql`), which serves
the permissive CORS headers this needs — no backend change required.

## File structure

New pure module `src/lib/exportCanvas.ts`: one function,
`renderCreationToBlob(image: HTMLImageElement, templateRow, layers): Promise<Blob>`,
returning a `image/png` Blob. Kept separate from `EditorPage.tsx` (which
stays focused on orchestration: click handling, loading state, delivery
path, toast) and is unit-testable in isolation the same way `layers.ts` and
`creationNaming.ts` already are — the wrapping/drawing logic is exactly
the kind of thing worth testing without a full component render. Since
`HTMLImageElement`/`HTMLCanvasElement` aren't meaningfully usable in jsdom,
tests for this module will need to mock the 2D context (`getContext`) the
same general way the existing test suite already mocks Supabase — asserting
on what drawing calls were made (`fillText`, `strokeText`, `drawImage`
arguments) rather than pixel output.

## Delivery: desktop download vs. mobile share

**Revised after live testing found the original approach wrong.** Feature
detection alone (`navigator.canShare?.({ files: [...] })`) is not enough to
decide desktop vs. mobile: confirmed live that desktop Safari on macOS also
supports the Web Share API for files, so a pure capability check routed a
real desktop export into the native macOS share sheet (AirDrop, Mail,
Messages, etc.) instead of a direct Downloads-folder save — not what
"Export" means on a desktop browser, regardless of what the browser
happens to support.

A first fix attempt used a `(pointer: coarse)` media query, which is also
wrong for the same underlying reason: it answers "what input device is
attached right now," not "what OS is this." A touchscreen Windows laptop
reports `pointer: coarse` but is still a desktop machine (no Files-app
confusion the way iOS has), and an iPad with a trackpad/Magic Keyboard
reports `pointer: fine` (iPadOS deliberately makes its trackpad mimic
mouse hover/click behavior) despite being exactly the device that needs
the share sheet.

**Actual approach:** `isMobileOrTabletDevice()` (`src/lib/exportDelivery.ts`)
answers the real question — is this a mobile/tablet OS, not a desktop OS —
via user-agent inspection, with one deliberate special case: iPadOS reports
itself as desktop "Macintosh" by default (Apple's choice since iPadOS 13,
for desktop-site compatibility), indistinguishable from a real Mac by UA
string alone. The reliable tell: no Mac has ever shipped with a
touchscreen, so a "Macintosh" UA that also reports touch points
(`navigator.maxTouchPoints > 1`) is actually an iPad. The share path is
only taken when **both** `isMobileOrTabletDevice()` and `canShareFile(file)`
are true — capability alone is no longer sufficient.

- **Mobile/tablet OS + share-capable (current iOS Safari, Android Chrome):**
  build a `File` from the PNG Blob and call `navigator.share({ files:
  [file], title: <filename> })`. Opens the native OS share sheet — "Save
  Image" goes straight to Photos, avoiding a generic Files-app download. A
  user cancelling the sheet rejects the promise with `AbortError` — treated
  as a silent no-op (no error toast). Any other rejection shows an error
  toast.
- **Desktop OS, or a mobile/tablet OS without share support:** create a
  Blob URL, a temporary `<a download="filename.png" href={url}>`, click
  it, then revoke the URL on the next tick. Browsers already save this to
  the user's Downloads folder by default — no extra handling needed for
  that part. This is now the unconditional desktop path, regardless of
  whatever the browser itself supports.

**Filename:** `<sanitized name>.png`, where name is `savedMeta?.name ??
source.name` (falls back to the template's own name if nothing's been
saved yet), sanitized by replacing runs of non-alphanumeric characters with
`-`.

## UI feedback

- **Loading state:** Export button shows a small spinner and becomes
  disabled while rendering + delivering (covers canvas draw/encode and, on
  the share path, the OS share-sheet handoff — not always instant,
  especially on older phones). Also guards against double-clicks.
- **Toast:** a minimal one-off — a couple of lines of local state in
  `EditorPage` (message + auto-dismiss timeout), not a reusable toast
  system, since nothing else in the app needs one yet. Shown on: successful
  download (desktop path) or successful share completion (mobile path).
  Not shown on a user-cancelled share. An error toast is shown if rendering
  or delivery genuinely fails (e.g. `toBlob` returns null, a non-abort
  share rejection, or an unexpected exception) — this is a real failure
  mode worth surfacing, not a change from current behavior since Export
  does nothing at all today.

## Button enablement

Export becomes enabled whenever `source?.type === 'template'` and
`templateRow` has loaded — it does **not** require the creation to have
been saved first (Export renders "exactly what the user has created" per
the user's own framing, independent of Save state). Stays disabled for
`source === null` and for freeform, same as today.

## Testing

- `exportCanvas.ts`: unit tests on the pure line-wrapping helper
  (`measureText`-based) with a mocked `CanvasRenderingContext2D`, plus a
  test asserting the overall draw call sequence (image first, then each
  layer's stroke+fill in order).
- `EditorPage.test.tsx`: mock `HTMLCanvasElement.prototype.toBlob` (jsdom
  doesn't implement real canvas rendering) and `navigator.share` /
  `navigator.canShare` to test both delivery branches, the loading-state
  toggle, the toast appearing/not appearing, and the cancelled-share silent
  case, without relying on real image decoding.

## Explicitly out of scope (confirmed with user)

- Uploading the exported PNG to Supabase / setting `exported_image_url`.
- Fixing the Gallery's thumbnail images or its own no-op Download menu
  item — both depend on `exported_image_url`, deferred to a future task.
- Freeform export (freeform editing itself isn't built yet).
- Pixel-perfect parity between the canvas render and the live DOM editor.
