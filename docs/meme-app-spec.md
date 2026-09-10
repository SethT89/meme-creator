# Meme Creator App — Spec

## Overview
A web app for creating memes two ways: starting from a recognizable template
(structured, positioned text fields) or completely freeform (upload any image,
place text/stickers anywhere). Every meme made — template-based or freeform —
is saved to a personal gallery ("My Creations").

Starting as a personal tool, built with an eye toward becoming a real product
later. No auth yet, but data is structured so multi-user support can be added
without a schema rewrite.

## Platform & Stack
- **Web app** (not native). Reasoning: faster iteration, no install friction,
  camera roll upload/download both work fine via browser file input and
  share/save flows — no native-specific capability is needed to justify a
  native build right now.
- **Backend: Supabase** (Postgres + storage buckets for images).
- **Auth: none yet.** Single hardcoded default user (you) as `user_id` on all
  rows. Schema should not preclude adding real auth later.

## Core Concepts

### 1. Templates (shared, global)
Templates are the traditional/recognizable meme formats (Drake, Distracted
Boyfriend, Expanding Brain, etc.). They are shared across all users — anyone
(currently just you) can use them, and only an admin can create new ones.

Each template has:
- **Blank image** — the actual meme image with no text, used as the canvas
  background when a user creates a new meme from this template.
- **Example image** — a reference showing the joke "filled in," shown to
  users so they understand how the format is meant to be used before they
  start editing.
- **Field definitions** — a list of text/label fields specific to that
  template. Each field has:
  - `label` (e.g. "Top text", "Boyfriend's caption")
  - `default position` (x, y)
  - `default size` (width, height, font size)
  - `default rotation`
  - Count and layout vary per template (e.g. Drake = 2 fields; Distracted
    Boyfriend = 3 fields; Expanding Brain = 4 fields, stacked).

When a user selects a template, its fields are auto-placed onto the canvas
per their defaults, pre-labeled, but remain fully draggable, resizable, and
rotatable afterward — same interaction model as freeform editing.

**Admin flow:** your user account can add a new template via an in-app form:
upload blank image, upload example image, then define fields one at a time
(label + position/size, set visually on the blank image rather than by
typing coordinates).

### 2. Freeform creation
- User uploads any image as the canvas background.
- User adds text layers and/or sticker/shape layers, placed and adjusted
  manually (no predefined structure).
- Same editor interaction model as templates: drag, resize, rotate, edit
  text content/font/color per layer.
- Freeform creations are **not** saved as reusable templates — each is a
  one-off, only ever saved as a creation (see below), never added to the
  shared template library.

### 3. Editor (shared between template & freeform modes)
- Canvas-based (for clean compositing and export).
- Layers: text and stickers/shapes, each independently:
  - Draggable
  - Resizable
  - Rotatable
  - Editable (text content, font, size, color; for template fields, label
    is pre-set but content is user-entered)
- Selecting a layer shows handles for resize/rotate, standard corner-grip
  pattern.
- Export: renders the full composited canvas to a downloadable PNG.

### 4. My Creations (personal gallery)
- Every meme you make — whether from a template or freeform — is saved
  here, scoped to your user_id.
- Saved as a **draft** while in progress (so you can leave and resume).
- Saved again once exported/downloaded (the finished state persists — it
  is not deleted or hidden after download).
- This is the one unified place for everything you've made, regardless of
  which mode created it.

## Data Model (Supabase / Postgres, rough shape)

```
templates
  id
  name
  blank_image_url
  example_image_url
  created_by (user_id, admin who added it)
  created_at

template_fields
  id
  template_id (FK -> templates)
  label
  position_x, position_y
  width, height
  rotation
  font_size (default)
  order_index

creations
  id
  user_id
  source_type (enum: 'template' | 'freeform')
  template_id (FK -> templates, nullable — only set if source_type = 'template')
  status (enum: 'draft' | 'final')
  canvas_data (JSON: full layer state — background image ref, all text/sticker
               layers with position/size/rotation/content/style)
  exported_image_url (nullable until first export)
  created_at, updated_at
```

## Open Implementation Details (left to Claude Code's judgment unless you want to weigh in)
- Exact resize/rotate handle UX (corner grips, rotate handle above the box, etc.)
- Font list — curated set vs. broader selection
- Layer ordering (z-index) controls
- Undo/redo — not scoped yet, nice-to-have
- Export resolution handling (match source image resolution recommended)
- Sticker/shape asset set — what shapes/stickers are available by default

## Explicitly Deferred (not v1)
- Real authentication / multi-user support (schema supports it, feature does not)
- Sharing creations with other users
- Native mobile app (revisit only if a real native-only need — e.g. offline
  use — emerges; Supabase backend is portable to a native frontend later
  without changes)
- Admin template management beyond the basic add-new-template flow
