# Meme Creator

A web app for creating memes two ways — from a recognizable template (positioned
text fields) or completely freeform (upload any image, place text/stickers
anywhere). Every meme is saved to a personal gallery, **My Creations**.

Full spec: [`docs/meme-app-spec.md`](docs/meme-app-spec.md).

Status: **app shell working end-to-end** (Vite + React + TypeScript, Supabase
wired end-to-end). Editor is the home screen; My Creations gallery, Save/Save
As, and design tokens are all real. Layer editing (drag/resize/rotate), real
canvas export, pickers, and the admin template flow are not built yet — see
`docs/superpowers/plans/` and `docs/superpowers/specs/2026-09-15-app-ui-ux-design.md`.

## Stack

| Layer    | Choice |
| -------- | ------ |
| Frontend | Vite + React + TypeScript, Tailwind CSS, shadcn-style primitives, TanStack Query, React Router |
| Backend  | Supabase (Postgres + Storage) |
| Auth     | None in v1 — single hardcoded `user_id`, schema is auth-ready |
| Hosting  | Cloudflare Pages (Git integration — push to `main` deploys) |

## Repository layout

```
docs/                      Spec and design notes (superpowers/specs, superpowers/plans)
supabase/
  config.toml              Supabase CLI project config
  migrations/               Versioned SQL migrations (source of truth for schema)
  seed.sql                 Local-only dev seed data
src/
  components/ui/            shadcn-style primitives (Button, ...)
  components/layout/        App shell / nav
  features/                 Page-level feature code (gallery, editor, templates)
  lib/                      Supabase client, TanStack Query hooks, small helpers
  types/database.ts         Generated from the Supabase schema
  routes.tsx, main.tsx      App entry + route table
.env.example               Template for .env.local (gitignored)
.mcp.json                  Supabase MCP server config for Claude Code
```

## Local setup

1. **Install deps**

   ```bash
   npm install
   ```

2. **Create `.env.local`** from the template and fill in values from your
   Supabase project (Project Settings → API, and Account → Access Tokens):

   ```bash
   cp .env.example .env.local
   ```

3. **Make the two MCP/CLI vars available to the Claude desktop app.** `~/.zshrc`
   does **not** work for this — it only loads for interactive terminal shells,
   and the desktop app isn't launched from one. Use `launchctl setenv` (reaches
   GUI apps) plus `~/.zshenv` (loads for every shell, including the
   non-interactive ones used to run terminal commands):

   ```bash
   launchctl setenv SUPABASE_ACCESS_TOKEN sbp_your_token
   launchctl setenv SUPABASE_PROJECT_REF your_project_ref
   printf 'export SUPABASE_ACCESS_TOKEN=sbp_your_token\nexport SUPABASE_PROJECT_REF=your_project_ref\n' >> ~/.zshenv
   ```

   Fully quit and reopen the Claude desktop app afterward.

4. **Link the CLI to the remote project** and push the schema:

   ```bash
   npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
   npx supabase db push
   ```

## Running the app

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check + production build to dist/
npm run test     # run the test suite once
npm run lint     # ESLint
npm run format   # Prettier, writes changes
```

The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.local`
(see `.env.example`) — these are client-safe copies of the values already used
by the Supabase CLI/MCP server, just re-exposed with the `VITE_` prefix Vite
requires for browser-visible env vars.

## Working with the database

- **Schema changes** go in a new file under `supabase/migrations/` (never edit an
  applied migration). Apply with `npx supabase db push`.
- **Local Postgres** for iteration: `npx supabase start` / `npx supabase db reset`
  (requires Docker).
- The **Supabase MCP server** (configured in `.mcp.json`) lets Claude Code
  inspect schema and run queries against the linked project directly.
- After a schema change, regenerate `src/types/database.ts` (via the Supabase
  MCP `generate_typescript_types` tool, or `npx supabase gen types typescript`).

## Data model

`templates` · `template_fields` · `creations` — see the init migration and the
spec for details. `creations` is the unified gallery for both template-based and
freeform memes; `canvas_data` (jsonb) holds the full layer state.
