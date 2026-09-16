# Canvas Speed-Dial FAB — Design

## Purpose

The editor toolbar currently has disabled `+ Text` and `+ Sticker` buttons
that do nothing — they've never been wired up, and they take up permanent
space in the top action row for functionality that doesn't exist yet. The
user wants to replace them with a Material Design-style "speed dial" FAB
(floating action button) that lives on the canvas itself: a single circular
button that expands into a small menu of add-actions when clicked. This
round adds the FAB shell and 4 placeholder actions (Add Text, Add Image, Add
Sticker, Add Emoji) with no real behavior behind any of them yet — wiring
each one up to actually place a layer is future work, tracked in
[[infra-setup]]'s remaining sub-projects list.

## Placement

A new `CanvasFab` component (`src/features/editor/CanvasFab.tsx`),
absolutely positioned relative to the existing image-wrapper div in
`EditorPage.tsx` (the `relative inline-block` container that already
shrink-wraps to the `<img>` — see `EditorPage.tsx` around line 375). The FAB
sits just outside that wrapper's bottom-right corner (negative `right`/
`bottom` offset), in the checkerboard working-area space — never overlapping
the template image, and not pinned to the far corner of the whole scrollable
canvas panel (too far from the actual work).

Below the `sm` breakpoint, the FAB switches to overlaying the image directly
(`right`/`bottom` set to small positive insets instead of negative ones) —
there isn't reliably enough room outside the image on a narrow viewport, and
this matches how other canvas controls (the property bar, the sidebar
itself) already adapt responsively in this codebase.

This only needs to render when a template is actually loaded — same guard
(`source?.type === 'template'`) as the layers themselves, since there's no
image wrapper to anchor to otherwise.

## Interaction

- **Closed state:** one circular button, lucide `Plus` icon.
- **Click toggles open/closed.** When open, the icon swaps to lucide `X`
  (not a CSS rotation of the same glyph — a plain swap is simpler and the
  two icons are visually similar enough in weight that a rotate animation
  isn't needed to read as "this button now closes the thing").
- **Open state:** 4 mini-FAB buttons fan out vertically above the main FAB,
  each rendered with its icon and an always-visible text label to its left
  (matching the reference layout the user provided — label chip, then the
  round icon button), in this order top-to-bottom: Add Emoji, Add Sticker,
  Add Image, Add Text (closest to the main FAB, since it's the most likely
  first action).
- **Mini-FAB clicks are no-ops** — no `disabled` attribute (they get real
  hover/active visual states, since they're going to become real
  interactive controls eventually), but no handler does anything yet.
  Clicking one does **not** close the menu.
- **Closing the menu** happens two ways: clicking the main FAB again
  (toggles closed), or clicking anywhere else on the page — reusing the
  existing page-level click-outside pattern `EditorPage` already has for
  deselecting the property bar (a `stopPropagation` on the FAB's own
  wrapper, same shape as the property bar's existing handler).

## Visual design

Circular buttons using the existing design tokens (`--color-primary` /
`--color-primary-foreground`), consistent with every other primary action in
the app (`Button`'s `default` variant) — not the pink shown in the user's
reference screenshot, which was a generic example image, not a color
direction. Main FAB is the larger of the two sizes (e.g. `h-14 w-14`), mini
FABs smaller (e.g. `h-10 w-10`), both `rounded-full`. Labels render as small
dark pill/chip text next to each mini-FAB, matching the reference image's
label treatment. Reuses the app's existing shadow language (the same
elevation styling already used for the floating content panel) rather than
inventing a new one.

## Icons

Adds `lucide-react` as a new dependency (confirmed with the user — preferred
over hand-rolled SVGs so the app sticks to icons that are already a
de facto standard, revisiting custom icons only if a real need for fully
custom iconography comes up later).

- Main FAB: `Plus` (closed) / `X` (open)
- Add Text: `Type`
- Add Image: `Image`
- Add Sticker: `Sticker`
- Add Emoji: `Smile`

## Removed

The `+ Text` and `+ Sticker` `<Button disabled>` elements currently in
`EditorPage.tsx`'s toolbar row (around lines 341–346) are deleted outright,
not hidden or disabled-by-default — their functionality is fully superseded
by the FAB's menu.

## Testing

- `CanvasFab`: renders closed by default (`Plus` icon, no mini-FABs
  visible); clicking toggles open (icon becomes `X`, 4 labeled mini-FABs
  appear in the expected order); clicking a mini-FAB does not close the
  menu; clicking the main FAB again closes it; a click event on `document`
  outside the FAB's own subtree closes it when open (mirrors the existing
  property-bar deselect test pattern in `EditorPage.test.tsx`).
- `EditorPage`: no more `+ Text` / `+ Sticker` buttons in the toolbar;
  `CanvasFab` renders when a template is loaded, doesn't render when the
  canvas is blank.
- The actual anchored positioning (just-outside-the-image on desktop vs.
  overlay-on-image on mobile) gets verified live in the browser at both
  viewport sizes, same approach as prior layout work in this codebase —
  positioning correctness isn't meaningfully jsdom-testable.

## Out of scope (explicitly deferred)

- Any real behavior behind the 4 actions (actually placing a text/image/
  sticker/emoji layer on the canvas) — this round is the FAB shell only.
- Icon-only/tooltip mode for the mini-FABs — revisit once the real action
  set is known and it's clear whether labels are still needed.
- Keyboard/focus-trap handling for the expanded menu (e.g. Escape to close,
  focus cycling) — not addressed this round.
