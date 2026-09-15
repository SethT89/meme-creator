# Whole-App UI/UX — Design

**Status:** Approved
**Date:** 2026-09-15

## Purpose

Establish the shape of the entire application — screens, navigation, the
editor's interaction model, and the save/gallery flow — before building any
individual feature sub-project (canvas editor internals, template mode,
gallery, admin). This replaces sub-project 2 ("Canvas editor core") from the
original build decomposition with a broader "design the whole app first"
pass, because the editor's mechanics can't be designed sensibly without
knowing what screen it lives on and what surrounds it.

This spec covers **screens, navigation, and interaction model**. It does not
cover: the canvas editor's rendering/drag-math implementation, the
`+Text`/`+Sticker` placement flow, color/font picker UI, or the admin
add-template flow — see "Deferred / not yet decided" below.

## App structure — one merged home screen

There is no separate "choose a template or upload" screen. **The editor is
the entire app's front door.** Landing on it with nothing loaded shows its
**empty state**: an upload dropzone (freeform) above a grid of template
thumbnails (shown as each template's filled-in *example* image, for
recognizability — the *blank* image loads onto the canvas once picked).
Picking either transitions the same screen into edit mode, with the canvas
sized to whatever image loaded.

**My Creations** (the gallery) is a separate, real page — reached via a
small persistent link in the header (`My Creations →`), not the landing
screen.

**Why this shape, not alternatives considered:**
- **Gallery-first home** (rejected) — the natural comparison is tools like
  Figma/Canva that open to "your files," but that fits *ongoing projects*
  you keep returning to. A meme is typically a one-off, transient creation —
  most visits are "make a thing," not "revisit a thing."
- **Separate "New Meme" picker screen before the editor** (superseded) — the
  canvas is always sized to *some* image; there's no meaningful empty-canvas
  state the way an infinite whiteboard tool has. Since a template/upload
  choice must happen before editing regardless, folding that choice into the
  editor's own empty state removes a screen/navigation step for free, without
  losing anything.
- **Infinite pannable canvas with a camera/zoom system** (Canva-style,
  rejected for now) — genuinely useful for dense, many-element, possibly
  multi-page compositions, which is what Canva/Figma are built for. A meme
  is one image plus a handful of text/sticker layers — small enough to
  always fit on screen. Adopting a camera transform would mean every future
  interaction (drag, resize, rotate, handle placement) has to account for
  it — real architectural cost with no corresponding need here. Mobile's
  precision problem (small screen, imprecise touch) is solved separately by
  pinch-to-zoom as a pure *view* convenience (a CSS transform at render
  time) — it never touches the underlying layer coordinates, so it doesn't
  require the camera-system architecture either.

## Editor layout & interaction

**Floating minimal controls** (validated against Canva's own pattern — see
`inspiration/Canva_Project.png`): the canvas is clean by default, with a
small button cluster top-right — `Start Over` / `+ Text` / `+ Sticker` /
`Export` / the Save control (see below). Nothing else persists on screen.

Selecting a layer (tap/click) shows:
- Corner-grip resize handles + a rotate handle, directly on the layer
- A floating **property bar**: a dark rounded-pill toolbar, styled after
  FigJam's floating text toolbar (`inspiration/Figjam_Text_Details.png`),
  positioned near the selection. Contents: Font, Size, Color, bring-to-Front,
  Delete.
- **Size control** is not a bare input — it's a small panel with presets
  (Small / Medium / Large / Extra Large / Huge) plus a numeric override at
  the bottom, matching `inspiration/Figjam_Text_Details_FontSize.png`.

Tapping empty canvas deselects (handles + property bar disappear).

**Canvas sizing:** always matches the aspect ratio of whatever image is
loaded (template blank image, or the user's upload) — never a forced/fixed
shape, never stretched or letterboxed. This was already the plan's intent
("Export resolution handling (match source image resolution)" in the base
spec) — this design makes it explicit for the live editing view too.

**Cropping** (changing an image's aspect ratio after the fact) is an
explicitly deferred nice-to-have, not part of any current sub-project.

**Mobile:** pinch-to-zoom as a display-only convenience for precise
handle-grabbing on small screens — implemented as a render-time transform,
not a change to the layer coordinate model. Not needed on desktop (mouse
precision doesn't have this problem).

## Save & export model

Three distinct actions, replacing the base spec's simpler
draft/final-on-export model:

1. **Silent autosave** — the in-progress creation is saved as a draft in the
   background continuously. Purely a crash/refresh safety net; no UI, never
   shown to the user, doesn't require login (ties to the existing hardcoded
   v1 user, exactly as the original schema was built for).
2. **Export** — client-side PNG download of the current canvas state. Stays
   in the editor. Does **not** write anything to the gallery.
3. **Save to Gallery** — explicit, user-visible action that persists the
   creation as a real, browsable gallery entry. Behavior depends on whether
   this creation has been saved before:
   - **Never saved** (new creation): the button reads "Save to Gallery" and
     opens a dialog — **Name** (pre-filled `"{Template Name} {N}"` for
     template-based creations, e.g. "Drake 1", or `"My Meme {N}"` for
     freeform, both editable) and **Tags** (free-text chips; typing suggests
     previously-used tags ranked by frequency, or creates a new one on
     Enter). Confirming writes a new `creations` row.
   - **Previously saved** (opened from the gallery): the button becomes a
     split control — **Save** (quick, overwrites the existing entry in
     place, no dialog, just a confirmation toast) and a dropdown for
     **Save As…** (opens the same dialog as "never saved," pre-filled with
     `"{original name} copy"`, creating a *new*, separate entry).

A "Save to Gallery" write persists the **full editable layer state**
(`canvas_data`), not a flattened image — this was already the base schema's
intent (`canvas_data` jsonb column). `exported_image_url` (already in the
base schema) is a cached rendered snapshot used for gallery thumbnails, kept
alongside `canvas_data` rather than replacing it.

**Schema implication for whichever sub-project implements the gallery:** the
base `creations` table needs two additional columns not in the original
design — `name` (text) and `tags` (text array). Not implemented by this
spec; noted here so the gallery sub-project's design doesn't rediscover it.

## Gallery ("My Creations")

Grid of cards (thumbnail + name + tags). Clicking a card opens a small menu
with two actions:
- **Download** — flattened PNG download, no navigation, doesn't open the
  editor
- **Open in editor** — loads the creation's full `canvas_data` back into the
  editor, fully editable again (same screen as the app's home/empty state,
  now populated) — this is what puts the editor into "previously saved" mode
  and switches its Save control to the Save/Save As split.

Search/filter UI for tags is anticipated (tags exist specifically to support
it) but not designed yet — deferred.

## Design references

Screenshots and notes from Canva and FigJam, captured to validate/inform the
above, live in [`inspiration/`](../../../inspiration/README.md):
floating selection toolbars (Canva), minimal persistent chrome (FigJam),
dark-pill floating text toolbar and preset+numeric size control (FigJam),
and gallery search/filter pattern (Canva's "All Projects").

## Deferred / not yet decided

Explicitly out of scope for this spec — each needs its own design pass
before implementation:

- How `+ Text` / `+ Sticker` actually place a new layer onto the canvas
  (default position/size, sticker asset picker)
- Color picker and font picker UI
- Whether "Start Over" warns about unsaved/unexported changes
- Empty-gallery copy/state
- Gallery search/filter UI (tag-based)
- The admin add-template flow (sub-project 5 in the original decomposition)
  — untouched by this spec
- Crop tool (mentioned as a future nice-to-have, no design yet)
