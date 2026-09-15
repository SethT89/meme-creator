# App Scaffold & Architecture — Design

**Status:** Approved
**Date:** 2026-09-14
**Sub-project:** 1 of 5 (see "Build decomposition" below)

## Purpose

Establish the foundational Vite + React application, its conventions, and its
deploy pipeline, so every subsequent sub-project (canvas editor, template
mode, gallery, admin) is built on a settled structure instead of ad hoc
choices made mid-feature.

This spec does not cover the canvas editor's internals, template field
placement, or the admin form — those are separate sub-projects (see below).

## Build decomposition

The full product (see `docs/meme-app-spec.md`) is being built as five
sub-projects, each with its own design → plan → implementation cycle:

1. **App scaffold & architecture** (this doc)
2. Canvas editor core (layers, drag/resize/rotate, text/sticker editing —
   freeform mode; templates reuse the same editor)
3. Template mode (field definitions, auto-placement onto the canvas)
4. My Creations gallery (draft/save/export flow)
5. Admin: add-template flow

## Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Vite + React + TypeScript | No SSR needed (Supabase is called client-side); fastest dev loop; large ecosystem for canvas/drag-interaction libraries. TS catches bugs in layer position/size/rotation math and keeps generated DB types in sync with the schema. |
| Styling | Tailwind CSS | Utility-first, no separate stylesheets to keep in sync, fast iteration on the app chrome (editor canvas itself is custom-drawn regardless of styling choice). |
| Component primitives | shadcn/ui-style (Radix UI + Tailwind, copied into the repo, not an npm dependency) | Accessible behavior (focus traps, keyboard nav, ARIA) for free; code lives in-repo so "update once, reflected everywhere" is a plain file edit, no fighting a library's theming API. |
| Server state | TanStack Query | Caching, loading/error states, and refetching for Supabase calls (templates, creations) without hand-rolling it per component. |
| Editor-local state | React `useReducer`, local to the editor feature | In-progress layer positions/sizes/rotation don't need to leave the component until an explicit save; not a fit for a query-cache library. |
| Routing | React Router | A handful of distinct pages (gallery, new-creation picker, editor, admin). |
| Linting/formatting | ESLint + Prettier | Standard, low-maintenance consistency. |
| Testing | Vitest + React Testing Library | Harness in place from the start; not full TDD ceremony at scaffold time — that applies per-feature during implementation of sub-projects 2-5. |
| Hosting | Cloudflare Pages, Git integration | User has a Cloudflare account already; static hosting matches a client-side SPA; push-to-deploy satisfies the "easy updates" goal from initial infra setup. |

### Rejected alternatives (and why)

- **Next.js** — same React model, but its main advantages (SSR, API routes,
  file-based routing) aren't needed for a pure client-side SPA and would
  mostly mean fighting the framework into static-export mode. Revisit only if
  a later feature needs server-rendered pages (see below).
- **SvelteKit** — lighter runtime, but a smaller ecosystem for canvas/
  interaction libraries and a less common stack for this project going
  forward.
- **Component library (Mantine/Chakra)** — fast for standard UI, but imposes
  a design language that fights the custom canvas editor, which is the core
  of the app.
- **Global store (Zustand/Redux) for all state** — most state is server data
  (Supabase), which TanStack Query already handles; the remaining state
  (live layer editing) is local to one feature and doesn't need to be global.

### What would invalidate the Vite+React SPA choice

Documented so a future revisit has the reasoning, not just the conclusion:

1. **Public shareable links with social previews** (share a meme, see the
   image preview in Discord/iMessage/Twitter) — needs server-rendered meta
   tags per-meme, which a pure client SPA can't produce. Not in v1 scope;
   the base spec defers "sharing creations with other users."
2. **Server-authoritative logic beyond what Supabase RLS can express** (e.g.
   moderation, watermarking, rate limiting) — doesn't require abandoning
   Vite+React (Cloudflare Pages Functions can sit alongside the static SPA),
   but if this logic grows extensive, a framework with built-in API routes
   pulls more weight.
3. **Native mobile** — explicitly deferred in the base spec; the frontend
   would be rewritten regardless of what it's built in today.

Since Next.js also runs React, if #1 or #2 materializes, editor/component
code is expected to largely port over — this is not treated as a one-way
door.

## Project structure

```
src/
  components/
    ui/           shadcn-style primitives (Button, Input, Modal, Card, ...)
    layout/       app shell, navigation
  features/
    gallery/      My Creations list + cards
    editor/       canvas editor (layers, drag/resize/rotate, text/sticker controls)
    templates/     template picker, admin add-template form
  lib/
    supabase.ts    Supabase client instance
    queries/       TanStack Query hooks (useTemplates, useCreations, etc.)
  types/
    database.ts    generated from the Supabase schema (npx supabase gen types)
  routes.tsx
  main.tsx
```

Components never call Supabase directly — they call hooks exported from
`lib/queries/`, which wrap the Supabase client.

## Routes

| Path | Purpose |
|---|---|
| `/` | My Creations gallery (drafts + finished memes) |
| `/new` | Choose template or freeform to start a new creation |
| `/editor/:creationId` | The canvas editor — shared by template and freeform modes |
| `/admin/templates/new` | Admin add-template flow |

## Environment configuration

Vite only exposes env vars prefixed `VITE_` to browser code. The existing
`.env.local` (set up for the Supabase CLI/MCP server) is extended with
client-safe copies — no new secrets are introduced, both values already
exist:

```
VITE_SUPABASE_URL=https://yjrzyvattombesoqhtpy.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable/anon key>
```

The `service_role` key is never referenced by anything under `src/` — it is
a server-only secret and RLS is what protects data reachable via the anon
key.

`.env.example` gets these two keys added alongside the existing CLI/MCP
entries.

## Deploy pipeline (Cloudflare Pages)

- **Connection:** Git integration — the GitHub repo (`SethT89/meme-creator`)
  is connected once via the Cloudflare dashboard (user step, tied to their
  Cloudflare login).
- **Framework preset:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Production branch:** `main` — every push auto-builds and deploys
- **Preview deploys:** automatic, one per branch/PR
- **Environment variables:** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  are entered directly in Cloudflare Pages project settings (Cloudflare's
  build environment does not see the gitignored `.env.local`)

## Data layer

- `lib/supabase.ts` exports a single Supabase client instance constructed
  from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- `types/database.ts` is generated via `npx supabase gen types typescript`
  and regenerated whenever a migration changes the schema.
- `lib/queries/` holds one file per resource (`templates.ts`, `creations.ts`,
  ...), each exporting TanStack Query hooks (`useTemplates()`,
  `useCreateDraft()`, `useSaveDraft()`, etc.).

## Testing

Vitest + React Testing Library configured and runnable (`npm run test`) from
scaffold time, so sub-projects 2-5 can write tests as they're built rather
than retrofitting a test setup later. No meaningful test coverage is expected
from the scaffold itself — there's no application logic yet, only
configuration.

## Out of scope for this sub-project

- Canvas editor internals (sub-project 2)
- Template field placement UI (sub-project 3)
- Gallery UI (sub-project 4)
- Admin template form (sub-project 5)
- Custom domain for Cloudflare Pages
- CI beyond Cloudflare's own build-on-push (no separate GitHub Actions)
