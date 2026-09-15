# Design inspiration — Canva & FigJam

Reference screenshots from two tools with UI patterns similar to what we need:
a canvas editor with selectable/movable objects, and a project gallery.
Captured 2026-09-15 during the whole-app UI/UX brainstorm.

## Canva_Home.png — "All Projects" gallery

Grid of project thumbnails with a search bar and filter dropdowns (Type,
Category, Owner, Date modified). Validates our plan for **My Creations**:
grid layout, search, and filtering — our filters would be tags instead of
Type/Category/Owner. Persistent left icon-sidebar nav (Create, Home,
Projects, Templates, Brand...) — we're intentionally *not* copying this;
our app is 3-4 screens, not a full workspace, so we went minimal-nav instead.

## Canva_Project.png — editor, object selected

Small floating toolbar (lock / duplicate / add-page icons) attached directly
above the selected object on the canvas. This is real-world validation of
the pattern we already chose for our editor (floating controls anchored to
the selection, not a persistent side panel). Also note the "Danger zone"
bleed/margin warning overlay on the canvas edge — a nice-to-have idea for
later (warn when text/stickers get too close to the image edge), not v1.

## FigJam_Project.png — blank canvas

Near-zero chrome. One floating pill-shaped toolbar, bottom-center, holding
every tool (select, pan, pen, shapes, text, frame, table, sticky note,
comment, +). Reinforces that a minimal, floating-toolbar approach (vs.
persistent side panels) reads as clean and standard, not sparse.

## Figjam_Text_Details.png — floating text toolbar

Dark, pill-shaped floating toolbar (color swatch, font, size dropdown, bold,
strikethrough, link, list, share, alignment) appearing directly above text
being edited. This is very close to our editor's planned "floating property
bar" — good direct reference for the dark-pill visual style and control
ordering/grouping (icon-only, tightly packed).

## Figjam_Text_Details_FontSize.png — size control, expanded

The size dropdown isn't a plain number input — it's presets (Small, Medium,
Large, Extra Large, Huge) *plus* a raw numeric field below for exact control.
Better UX than a bare input: fast common choices, with precision available
when needed. Worth using this pattern for our text-layer size control instead
of a plain number field.

## Takeaways for our editor's floating property bar

- Dark pill, icon-first buttons, tightly grouped — match FigJam's visual style
- Size control = presets + numeric override, not a bare input (FigJam pattern)
- Toolbar anchors to the selected object, not a fixed screen position (Canva pattern)
